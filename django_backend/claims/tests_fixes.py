"""Regression tests for the claims correctness/security fixes:

1. perform_create must never attach a claim to another tenant's policy.
2. Claim-number generation must be collision-safe.
3. Reinsurance recovery stages: Estimated -> Approved -> Billed -> Collected.
"""

from datetime import date
from unittest import mock
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim, ClaimActivityLog
from claims.views import generate_unique_claim_number


class ClaimsFixesTestBase(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.org_a = Organization.objects.create(
            name='Fix Carrier A', slug='fix-carrier-a', naic_company_code='NAIC-FIX-A',
        )
        self.org_b = Organization.objects.create(
            name='Fix Carrier B', slug='fix-carrier-b', naic_company_code='NAIC-FIX-B',
        )
        self.org_empty = Organization.objects.create(
            name='Fix Carrier Empty', slug='fix-carrier-empty', naic_company_code='NAIC-FIX-E',
        )
        self.agent_a = User.objects.create_user(
            email='fix.agent.a@example.com', password='StrongAgentPassword2026!',
            name='Agent A', role='Agent', organization=self.org_a,
        )
        self.admin_a = User.objects.create_user(
            email='fix.admin.a@example.com', password='StrongAdminPassword2026!',
            name='Admin A', role='Admin', organization=self.org_a,
        )
        self.customer_user_a = User.objects.create_user(
            email='fix.insured@example.com', password='StrongCustomerPassword2026!',
            name='Insured A', role='Customer', organization=self.org_a,
        )
        self.agent_empty = User.objects.create_user(
            email='fix.agent.empty@example.com', password='StrongAgentPassword2026!',
            name='Agent Empty', role='Agent', organization=self.org_empty,
        )

        self.customer_a = Customer.objects.create(
            customer_code='CUST-FIX-A1', organization=self.org_a, name='Fix Logistics A',
            contact_person='Insured A', email='fix.insured@example.com',
            industry='Logistics', risk_score=30,
        )
        self.customer_b = Customer.objects.create(
            customer_code='CUST-FIX-B1', organization=self.org_b, name='Fix Logistics B',
            contact_person='Insured B', email='fix.insured.b@example.com',
            industry='Logistics', risk_score=30,
        )
        # Org A policy: deductible $50,000, 40% ceded — matching the
        # verification case (gross $150k -> recovery $40k).
        self.policy_a = Policy.objects.create(
            policy_number='POL-FIX-A1', organization=self.org_a, customer=self.customer_a,
            underwriter=self.admin_a, title='Property A', line_of_business='Commercial Property',
            coverage_limit=10000000, deductible=50000, annual_premium=200000,
            effective_date=date(2026, 1, 1), expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )
        self.policy_b = Policy.objects.create(
            policy_number='POL-FIX-B1', organization=self.org_b, customer=self.customer_b,
            underwriter=self.admin_a, title='Property B', line_of_business='Commercial Property',
            coverage_limit=10000000, deductible=10000, annual_premium=300000,
            effective_date=date(2026, 1, 1), expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )

    def _create_claim_payload(self, **overrides):
        payload = {
            'incidentDate': '2026-11-01',
            'amount': 150000,
            'description': 'Fix-suite test loss.',
        }
        payload.update(overrides)
        return payload


class ClaimCrossTenantPolicyTests(ClaimsFixesTestBase):
    def test_policy_id_from_another_org_is_rejected(self):
        """A policyId belonging to Org B must NOT be usable by an Org A user."""
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            '/api/claims/', self._create_claim_payload(policyId='POL-FIX-B1'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Claim.objects.filter(policy=self.policy_b).exists())
        self.assertEqual(Claim.objects.count(), 0)

    def test_unknown_policy_id_is_rejected_not_fallback(self):
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            '/api/claims/', self._create_claim_payload(policyId='POL-DOES-NOT-EXIST'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Claim.objects.count(), 0)

    def test_create_without_policy_id_uses_first_policy_in_own_org(self):
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post('/api/claims/', self._create_claim_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        claim = Claim.objects.get(claim_number=response.data['claimNumber'])
        self.assertEqual(claim.policy_id, self.policy_a.id)
        self.assertEqual(claim.organization_id, self.org_a.id)

    def test_create_with_own_org_policy_id_succeeds(self):
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            '/api/claims/', self._create_claim_payload(policyId='POL-FIX-A1'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        claim = Claim.objects.get(claim_number=response.data['claimNumber'])
        self.assertEqual(claim.policy_id, self.policy_a.id)

    def test_create_with_no_policy_in_org_is_rejected(self):
        self.client.force_authenticate(user=self.agent_empty)
        response = self.client.post('/api/claims/', self._create_claim_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Claim.objects.count(), 0)


class ClaimNumberCollisionTests(ClaimsFixesTestBase):
    def test_generated_numbers_are_unique_across_many_claims(self):
        self.client.force_authenticate(user=self.agent_a)
        numbers = set()
        for _ in range(15):
            response = self.client.post('/api/claims/', self._create_claim_payload(), format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            numbers.add(response.data['claimNumber'])
        self.assertEqual(len(numbers), 15)

    def test_generation_survives_forced_random_collision(self):
        Claim.objects.create(
            claim_number='CLM-2026-9500', organization=self.org_a, policy=self.policy_a,
            incident_date=date(2026, 11, 1), gross_amount=150000, deductible=50000,
            reinsurance_recovery=40000, status=Claim.Status.PENDING, description='Pre-existing.',
        )
        with mock.patch('claims.views.random.randint', return_value=9500):
            candidate = generate_unique_claim_number()
        self.assertNotEqual(candidate, 'CLM-2026-9500')
        self.assertFalse(Claim.objects.filter(claim_number=candidate).exists())


class ClaimRecoveryStageTests(ClaimsFixesTestBase):
    def _create_claim_via_api(self):
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            '/api/claims/', self._create_claim_payload(policyId='POL-FIX-A1'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data['claimNumber'], response.data

    def _approve(self, claim_number):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.patch(
            f'/api/claims/{claim_number}/', {'action': 'Approve', 'reviewerNote': 'Approved for fix suite.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response

    def test_new_claim_starts_estimated_with_zero_billed_and_collected(self):
        claim_number, data = self._create_claim_via_api()
        self.assertEqual(data['recoveryStage'], 'Estimated')
        self.assertEqual(data['recoveryBilledAmount'], 0.0)
        self.assertEqual(data['recoveryCollectedAmount'], 0.0)
        # gross $150k, deductible $50k, 40% ceded -> estimated recovery $40k
        self.assertEqual(data['reinsuranceRecovery'], 40000.0)
        claim = Claim.objects.get(claim_number=claim_number)
        self.assertEqual(claim.recovery_stage, Claim.RecoveryStage.ESTIMATED)

    def test_approve_moves_recovery_stage_to_approved(self):
        claim_number, _ = self._create_claim_via_api()
        response = self._approve(claim_number)
        self.assertEqual(response.data['recoveryStage'], 'Approved')
        claim = Claim.objects.get(claim_number=claim_number)
        self.assertEqual(claim.recovery_stage, Claim.RecoveryStage.APPROVED)
        self.assertEqual(float(claim.recovery_billed_amount), 0.0)
        self.assertEqual(float(claim.recovery_collected_amount), 0.0)

    def test_reject_keeps_recovery_stage_estimated_and_amount(self):
        claim_number, _ = self._create_claim_via_api()
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.patch(
            f'/api/claims/{claim_number}/', {'action': 'Reject', 'reviewerNote': 'Excluded peril.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        claim = Claim.objects.get(claim_number=claim_number)
        self.assertEqual(claim.status, Claim.Status.REJECTED)
        self.assertEqual(claim.recovery_stage, Claim.RecoveryStage.ESTIMATED)
        self.assertEqual(float(claim.reinsurance_recovery), 40000.0)

    def test_billed_then_collected_progression_with_audit_log(self):
        claim_number, _ = self._create_claim_via_api()
        self._approve(claim_number)
        self.client.force_authenticate(user=self.agent_a)

        billed = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Billed', 'amount': 40000}, format='json',
        )
        self.assertEqual(billed.status_code, status.HTTP_200_OK)
        self.assertEqual(billed.data['recoveryStage'], 'Billed')
        self.assertEqual(billed.data['recoveryBilledAmount'], 40000.0)

        collected = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Collected', 'amount': 35000}, format='json',
        )
        self.assertEqual(collected.status_code, status.HTTP_200_OK)
        self.assertEqual(collected.data['recoveryStage'], 'Collected')
        self.assertEqual(collected.data['recoveryCollectedAmount'], 35000.0)

        claim = Claim.objects.get(claim_number=claim_number)
        actions = [log.action for log in claim.activity_logs.all()]
        self.assertTrue(any('Billed reinsurance recovery' in a for a in actions))
        self.assertTrue(any('Collected reinsurance recovery' in a for a in actions))

    def test_cannot_skip_from_approved_straight_to_collected(self):
        claim_number, _ = self._create_claim_via_api()
        self._approve(claim_number)
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Collected', 'amount': 10000}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_bill_a_pending_claim(self):
        claim_number, _ = self._create_claim_via_api()
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Billed', 'amount': 10000}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_billed_amount_cannot_exceed_estimated_recovery(self):
        claim_number, _ = self._create_claim_via_api()
        self._approve(claim_number)
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Billed', 'amount': 40001}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_collected_amount_cannot_exceed_billed_amount(self):
        claim_number, _ = self._create_claim_via_api()
        self._approve(claim_number)
        self.client.force_authenticate(user=self.agent_a)
        self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Billed', 'amount': 20000}, format='json',
        )
        response = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Collected', 'amount': 20001}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_record_recovery(self):
        claim_number, _ = self._create_claim_via_api()
        self._approve(claim_number)
        self.client.force_authenticate(user=self.customer_user_a)
        response = self.client.post(
            f'/api/claims/{claim_number}/recovery/', {'stage': 'Billed', 'amount': 10000}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_tenant_recovery_attempt_returns_404(self):
        foreign_claim = Claim.objects.create(
            claim_number='CLM-FIX-B1', organization=self.org_b, policy=self.policy_b,
            incident_date=date(2026, 11, 1), gross_amount=150000, deductible=10000,
            reinsurance_recovery=56000, status=Claim.Status.APPROVED,
            recovery_stage=Claim.RecoveryStage.APPROVED, description='Org B claim.',
        )
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.post(
            f'/api/claims/{foreign_claim.claim_number}/recovery/',
            {'stage': 'Billed', 'amount': 10000}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
