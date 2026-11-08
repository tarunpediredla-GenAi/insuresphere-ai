"""Automated tests for Claims Review Adjudication actions, audit log integrity, and authorization."""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim, ClaimActivityLog, SupportingDocument


class ClaimReviewAdjudicationTests(APITestCase):
    """
    Test suite verifying the three distinct human reviewer adjudication actions:
    1. Approve Claim Settlement
    2. Hold for Adjuster Inquiry
    3. Reject Claim
    Ensures correct backend-supported review statuses, accurate audit trail recording,
    preservation of historical activity logs, lack of auto-settlement payments,
    and role-based authorization boundaries.
    """

    def setUp(self):
        # 1. Organization Isolation
        self.organization = Organization.objects.create(
            name='Fictional Test Carrier Inc.',
            slug='fict-test-carrier',
            naic_company_code='NAIC-FICT-TEST',
        )

        User = get_user_model()
        # 2. Reviewer / Adjuster User (role: Agent)
        self.adjuster = User.objects.create_user(
            email='fict-adjuster@insuresphere.ai',
            password='StrongTestPassword2026!',
            name='Marcus Adjuster',
            role='Agent',
            organization=self.organization,
        )

        # 3. Claims Manager (role: Admin)
        self.admin = User.objects.create_user(
            email='fict-admin@insuresphere.ai',
            password='StrongAdminPassword2026!',
            name='Elena Claims Admin',
            role='Admin',
            organization=self.organization,
        )

        # 4. Policyholder User (role: Customer)
        self.customer_user = User.objects.create_user(
            email='fict-insured@example.com',
            password='StrongCustomerPassword2026!',
            name='Alex Policyholder',
            role='Customer',
            organization=self.organization,
        )

        # 5. Customer Record
        self.customer = Customer.objects.create(
            customer_code='CUST-FICT-901',
            organization=self.organization,
            name='Fictional Logistics LLC',
            contact_person='Alex Policyholder',
            email='fict-insured@example.com',
            industry='Warehousing & Logistics',
            risk_score=28,
        )

        # 6. Bound Policy
        self.policy = Policy.objects.create(
            policy_number='POL-FICT-2026-7700',
            organization=self.organization,
            customer=self.customer,
            underwriter=self.admin,
            title='Commercial Inland Marine & Storage',
            line_of_business='Commercial Property',
            coverage_limit=10000000,
            deductible=25000,
            annual_premium=120000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )

        # 7. SEPARATE Fictional Test Claim (Never touch production records or CLM-2026-9490)
        self.fictional_claim_number = 'CLM-TEST-2026-HOLD01'
        self.test_claim = Claim.objects.create(
            claim_number=self.fictional_claim_number,
            organization=self.organization,
            policy=self.policy,
            assigned_adjuster=self.adjuster,
            incident_date=date(2026, 11, 1),
            gross_amount=165000.00,
            deductible=25000.00,
            reinsurance_recovery=56000.00,
            status=Claim.Status.PENDING,
            priority='High',
            description='Fictional cold-storage piping pressure failure with localized inventory water damage.',
        )

        # Seed initial documents and immutable FNOL audit record
        SupportingDocument.objects.create(
            claim=self.test_claim,
            name='Initial_Damage_Declaration_Test.pdf',
            size='1.8 MB',
        )
        self.initial_log = ClaimActivityLog.objects.create(
            claim=self.test_claim,
            actor='Alex Policyholder (Customer)',
            action='First Notice of Loss (FNOL) submitted via Customer Portal with 1 supporting PDF.',
        )

        self.endpoint_url = f'/api/claims/{self.fictional_claim_number}/'

    def test_hold_for_adjuster_inquiry_action_records_pending_review(self):
        """
        Hold for Adjuster Inquiry MUST set or maintain the status as 'Pending Review',
        NEVER 'Approved', and accurately record the hold inquiry action in the audit log.
        """
        self.client.force_authenticate(user=self.adjuster)
        note = 'Holding claim for independent mechanical surveyor report and thermograph audit.'
        payload = {
            'action': 'Hold',
            'reviewerNote': note,
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        # 1. Verification of backend-supported review status
        self.assertEqual(self.test_claim.status, Claim.Status.PENDING)
        self.assertNotEqual(self.test_claim.status, Claim.Status.APPROVED)

        # 2. Verification of audit log entry
        logs = self.test_claim.activity_logs.all()
        self.assertEqual(logs.count(), 2)  # 1 initial + 1 new
        latest_log = logs.first()
        self.assertIn('Held claim for adjuster inquiry.', latest_log.action)
        self.assertIn(note, latest_log.action)
        self.assertEqual(latest_log.actor, 'Marcus Adjuster (Agent)')

        # 3. Verification of audit history preservation
        initial_log_still_present = logs.filter(id=self.initial_log.id).first()
        self.assertIsNotNone(initial_log_still_present)
        self.assertEqual(initial_log_still_present.action, self.initial_log.action)

    def test_hold_action_overrides_conflicting_approved_status_payload(self):
        """
        If a payload includes action='Hold' along with status='Approved' (due to UI or client bug),
        the Hold action takes absolute precedence and sets status to 'Pending Review', never 'Approved'.
        """
        self.client.force_authenticate(user=self.adjuster)
        payload = {
            'action': 'Hold',
            'status': 'Approved',  # Conflicting input
            'reviewerNote': 'Requested holding the claim for additional investigation.',
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.PENDING)
        self.assertNotEqual(self.test_claim.status, Claim.Status.APPROVED)

        latest_log = self.test_claim.activity_logs.first()
        self.assertIn('Held claim for adjuster inquiry.', latest_log.action)
        self.assertNotIn('Approved claim settlement.', latest_log.action)

    def test_approve_claim_settlement_action(self):
        """
        Approve Claim Settlement action sets status to 'Approved' and records approval action in audit log.
        """
        self.client.force_authenticate(user=self.admin)
        note = 'Approved net settlement of $140,000 ($165k gross less $25k deductible) after engineering review.'
        payload = {
            'action': 'Approve',
            'reviewerNote': note,
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.APPROVED)

        latest_log = self.test_claim.activity_logs.first()
        self.assertIn('Approved claim settlement.', latest_log.action)
        self.assertIn(note, latest_log.action)
        self.assertEqual(latest_log.actor, 'Elena Claims Admin (Admin)')

        # Original FNOL log is intact
        self.assertEqual(self.test_claim.activity_logs.count(), 2)

    def test_reject_claim_action(self):
        """
        Reject Claim action sets status to 'Rejected' and records rejection action in audit log.
        """
        self.client.force_authenticate(user=self.adjuster)
        note = 'Claim rejected: Damage resulted from pre-existing mechanical defect excluded under Section 3.2.'
        payload = {
            'action': 'Reject',
            'reviewerNote': note,
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.REJECTED)

        latest_log = self.test_claim.activity_logs.first()
        self.assertIn('Rejected claim.', latest_log.action)
        self.assertIn(note, latest_log.action)

        # Original FNOL log is intact
        self.assertEqual(self.test_claim.activity_logs.count(), 2)

    def test_status_field_hold_normalization(self):
        """
        If a client sends status='Hold' or 'Pending Review' without the explicit action field,
        the system correctly normalizes it to 'Pending Review' and logs 'Held claim for adjuster inquiry.'.
        """
        self.client.force_authenticate(user=self.adjuster)
        payload = {
            'status': 'Hold',
            'reviewerNote': 'Hold requested via status field.',
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.PENDING)

        latest_log = self.test_claim.activity_logs.first()
        self.assertIn('Held claim for adjuster inquiry.', latest_log.action)

    def test_previous_audit_records_are_never_deleted_or_rewritten(self):
        """
        Verify that sequential reviews append to the activity history and never delete or modify prior logs.
        """
        self.client.force_authenticate(user=self.adjuster)

        # Step 1: Place on Hold
        self.client.patch(
            self.endpoint_url,
            {'action': 'Hold', 'reviewerNote': 'First inquiry: Requesting forensic telemetry.'},
            format='json',
        )

        # Step 2: Hold renewed
        self.client.patch(
            self.endpoint_url,
            {'action': 'Hold', 'reviewerNote': 'Second inquiry: Awaiting contractor quote.'},
            format='json',
        )

        # Step 3: Approved
        self.client.patch(
            self.endpoint_url,
            {'action': 'Approve', 'reviewerNote': 'Final determination: Approved.'},
            format='json',
        )

        self.test_claim.refresh_from_db()
        logs = list(self.test_claim.activity_logs.all().order_by('timestamp'))

        # Total 4 logs: initial FNOL + 3 reviewer actions
        self.assertEqual(len(logs), 4)

        # Initial log is unchanged
        self.assertEqual(logs[0].id, self.initial_log.id)
        self.assertEqual(logs[0].action, self.initial_log.action)

        # Verify sequential actions
        self.assertIn('Held claim for adjuster inquiry.', logs[1].action)
        self.assertIn('First inquiry', logs[1].action)

        self.assertIn('Held claim for adjuster inquiry.', logs[2].action)
        self.assertIn('Second inquiry', logs[2].action)

        self.assertIn('Approved claim settlement.', logs[3].action)
        self.assertIn('Final determination: Approved.', logs[3].action)

    def test_customer_role_cannot_review_claims(self):
        """
        Policyholders (role 'Customer') must be forbidden from reviewing claims (HTTP 403).
        Claim status and audit logs must remain unchanged.
        """
        self.client.force_authenticate(user=self.customer_user)
        payload = {
            'action': 'Approve',
            'reviewerNote': 'Unauthorized self-approval attempt.',
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.PENDING)
        self.assertEqual(self.test_claim.activity_logs.count(), 1)

    def test_unauthenticated_user_cannot_review_claims(self):
        """
        Unauthenticated requests must be rejected with HTTP 401 Unauthorized.
        """
        self.client.logout()
        payload = {
            'action': 'Hold',
            'reviewerNote': 'Anonymous attempt.',
        }

        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.status, Claim.Status.PENDING)
        self.assertEqual(self.test_claim.activity_logs.count(), 1)

    def test_no_automatic_settlement_or_payment_triggered_on_hold(self):
        """
        Review adjudication must not automatically alter financial terms, deductibles,
        or trigger unapproved cash calls/payments.
        """
        self.client.force_authenticate(user=self.adjuster)
        initial_gross = self.test_claim.gross_amount
        initial_deductible = self.test_claim.deductible
        initial_recovery = self.test_claim.reinsurance_recovery

        payload = {
            'action': 'Hold',
            'reviewerNote': 'Hold for pricing verification.',
        }
        response = self.client.patch(self.endpoint_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.test_claim.refresh_from_db()
        self.assertEqual(self.test_claim.gross_amount, initial_gross)
        self.assertEqual(self.test_claim.deductible, initial_deductible)
        self.assertEqual(self.test_claim.reinsurance_recovery, initial_recovery)

