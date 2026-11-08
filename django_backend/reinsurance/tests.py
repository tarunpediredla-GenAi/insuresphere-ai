"""Automated end-to-end tests for Reinsurance Treaties, Actuarial Calculations, and Tenant Isolation."""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim
from reinsurance.models import ReinsuranceTreaty


class ReinsuranceTreatyModuleTests(APITestCase):
    """
    Comprehensive test suite verifying:
    1. Active 60% retained / 40% ceded proportional quota-share treaty structure
    2. Actuarial recovery calculation: gross loss $150,000, deductible $50,000 -> eligible $100,000, retained $60,000, recovery $40,000
    3. Treaty API endpoints (/api/reinsurance/treaties/ & calculate-cession)
    4. Multi-tenant organization isolation preventing cross-tenant access
    5. Exclusion of 'Pending Review' claims from settled/paid reinsurance recoveries in analytics
    6. Role-based permissions and unauthenticated blocking
    """

    def setUp(self):
        User = get_user_model()

        # 1. Organization A (Primary Cedant)
        self.org_a = Organization.objects.create(
            name='Syndicate Alpha Mutual',
            slug='syndicate-alpha',
            naic_company_code='NAIC-ALPHA-2026',
        )

        # 2. Organization B (Competitor Tenant)
        self.org_b = Organization.objects.create(
            name='Syndicate Beta Underwriters',
            slug='syndicate-beta',
            naic_company_code='NAIC-BETA-2026',
        )

        # 3. Users in Org A
        self.admin_a = User.objects.create_user(
            email='underwriter.alpha@insuresphere.ai',
            password='StrongAlphaPassword2026!',
            name='Alpha CUO',
            role='Admin',
            organization=self.org_a,
        )
        self.agent_a = User.objects.create_user(
            email='adjuster.alpha@insuresphere.ai',
            password='StrongAdjusterPass2026!',
            name='Alpha Adjuster',
            role='Agent',
            organization=self.org_a,
        )
        self.customer_a = User.objects.create_user(
            email='policyholder.alpha@example.com',
            password='StrongCustomerPass2026!',
            name='Alpha Policyholder',
            role='Customer',
            organization=self.org_a,
        )

        # 4. Users in Org B
        self.admin_b = User.objects.create_user(
            email='underwriter.beta@insuresphere.ai',
            password='StrongBetaPassword2026!',
            name='Beta CUO',
            role='Admin',
            organization=self.org_b,
        )

        # 5. Active 60% Retained / 40% Ceded Quota-Share Treaty (Org A)
        self.quota_share_treaty = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-2026-01',
            organization=self.org_a,
            name='2026 Commercial Property & Cyber Quota Share Treaty',
            treaty_type=ReinsuranceTreaty.TreatyType.QUOTA_SHARE,
            reinsurer_name='Swiss Re Corporate Solutions (Zurich)',
            sp_rating='AA-',
            cedant_retention_pct=60.00,
            ceded_share_pct=40.00,
            treaty_limit=30000000.00,
            attachment_point=0.00,
            ceded_premium_ytd=942000.00,
            recoveries_collected_ytd=418500.00,
            pending_recoveries=128000.00,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            status='Active',
        )

        # 6. Excess of Loss (XoL) Treaty (Org A)
        self.xol_treaty = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-2026-03',
            organization=self.org_a,
            name='High-Hazard Catastrophe XoL',
            treaty_type=ReinsuranceTreaty.TreatyType.XOL,
            reinsurer_name="Lloyd's Syndicate 2987",
            sp_rating='AA-',
            cedant_retention_pct=30.00,
            ceded_share_pct=70.00,
            treaty_limit=75000000.00,
            attachment_point=250000.00,
            ceded_premium_ytd=1410000.00,
            recoveries_collected_ytd=812000.00,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            status='Active',
        )

        # 7. Foreign Treaty belonging to Org B
        self.treaty_b = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-BETA-01',
            organization=self.org_b,
            name='Beta Maritime Treaty',
            treaty_type=ReinsuranceTreaty.TreatyType.QUOTA_SHARE,
            reinsurer_name='Munich Re',
            sp_rating='AA',
            cedant_retention_pct=50.00,
            ceded_share_pct=50.00,
            treaty_limit=20000000.00,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            status='Active',
        )

        # 8. Customer, Policy, and Claims for Claims-Level Recovery Ledger Verification
        self.customer_record = Customer.objects.create(
            customer_code='CUST-REINS-01',
            organization=self.org_a,
            name='Alpha Industrial Holdings',
            contact_person='Test Contact',
            email='reins-contact@example.com',
            industry='Manufacturing',
            risk_score=35,
        )

        self.policy = Policy.objects.create(
            policy_number='POL-REINS-701',
            organization=self.org_a,
            customer=self.customer_record,
            underwriter=self.admin_a,
            reinsurance_treaty=self.quota_share_treaty,
            title='Commercial All-Risk Policy',
            line_of_business='Commercial Property',
            coverage_limit=15000000.00,
            deductible=50000.00,
            annual_premium=250000.00,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=40.00,
        )

    def test_active_quota_share_treaty_configuration(self):
        """Verify the active 60% retained / 40% ceded quota-share treaty in Org A."""
        treaty = ReinsuranceTreaty.objects.get(treaty_code='TRT-2026-01')
        self.assertEqual(float(treaty.cedant_retention_pct), 60.0)
        self.assertEqual(float(treaty.ceded_share_pct), 40.0)
        self.assertEqual(float(treaty.cedant_retention_pct + treaty.ceded_share_pct), 100.0)
        self.assertEqual(treaty.status, 'Active')
        self.assertEqual(treaty.treaty_type, ReinsuranceTreaty.TreatyType.QUOTA_SHARE)
        self.assertEqual(treaty.reinsurer_name, 'Swiss Re Corporate Solutions (Zurich)')

    def test_quota_share_calculation_gross_150k_deductible_50k(self):
        """
        Test Gross Loss $150,000 and Deductible $50,000:
        Expected eligible loss = $100,000
        Expected retained loss = $60,000
        Expected reinsurer recovery = $40,000
        """
        calc = self.quota_share_treaty.calculate_recovery(gross_loss=150000.0, deductible=50000.0)

        self.assertEqual(calc['grossLoss'], 150000.0)
        self.assertEqual(calc['deductible'], 50000.0)
        self.assertEqual(calc['netEligibleLoss'], 100000.0)
        self.assertEqual(calc['cedantRetainedAmount'], 60000.0)
        self.assertEqual(calc['cededRecoveryAmount'], 40000.0)
        self.assertFalse(calc['cashCallTriggered'])

    def test_calculate_cession_api_endpoint(self):
        """POST /api/reinsurance/treaties/TRT-2026-01/calculate-cession/ returns verified amounts."""
        self.client.force_authenticate(user=self.admin_a)
        url = f'/api/reinsurance/treaties/{self.quota_share_treaty.treaty_code}/calculate-cession/'
        payload = {
            'grossLoss': 150000,
            'deductible': 50000,
        }

        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['netEligibleLoss'], 100000.0)
        self.assertEqual(data['cedantRetainedAmount'], 60000.0)
        self.assertEqual(data['cededRecoveryAmount'], 40000.0)
        self.assertFalse(data['cashCallTriggered'])

    def test_excess_of_loss_calculation_and_cash_call_threshold(self):
        """XoL calculation: attachment $250k, 70% ceded share. Cash call triggered if recovery >= $250k."""
        # Gross $650,000, deductible $50,000 -> net eligible $600,000.
        # Excess subject = $600,000 - $250,000 = $350,000.
        # Ceded recovery = $350,000 * 70% = $245,000 (below $250k cash call).
        calc1 = self.xol_treaty.calculate_recovery(gross_loss=650000.0, deductible=50000.0)
        self.assertEqual(calc1['netEligibleLoss'], 600000.0)
        self.assertEqual(calc1['cededRecoveryAmount'], 245000.0)
        self.assertEqual(calc1['cedantRetainedAmount'], 355000.0)
        self.assertFalse(calc1['cashCallTriggered'])

        # Gross $750,000, deductible $50,000 -> net eligible $700,000.
        # Excess subject = $700,000 - $250,000 = $450,000.
        # Ceded recovery = $450,000 * 70% = $315,000 (>= $250k -> cashCallTriggered = True).
        calc2 = self.xol_treaty.calculate_recovery(gross_loss=750000.0, deductible=50000.0)
        self.assertEqual(calc2['cededRecoveryAmount'], 315000.0)
        self.assertTrue(calc2['cashCallTriggered'])

    def test_treaties_list_endpoint_loads_from_postgres_scoped_to_organization(self):
        """GET /api/reinsurance/treaties/ loads active treaties for authenticated member's organization."""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get('/api/reinsurance/treaties/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        treaty_codes = [t['treatyCode'] for t in results]
        self.assertIn('TRT-2026-01', treaty_codes)
        self.assertIn('TRT-2026-03', treaty_codes)
        # Multi-tenant check: Org B's treaty MUST NOT be visible to Org A
        self.assertNotIn('TRT-BETA-01', treaty_codes)

    def test_prevent_cross_tenant_access_by_direct_lookup_and_action(self):
        """Users in Org A cannot view, retrieve, or calculate cession on treaties belonging to Org B."""
        self.client.force_authenticate(user=self.agent_a)

        # Direct GET of Org B's treaty
        response_get = self.client.get(f'/api/reinsurance/treaties/{self.treaty_b.treaty_code}/')
        self.assertEqual(response_get.status_code, status.HTTP_404_NOT_FOUND)

        # POST calculate-cession on Org B's treaty
        response_calc = self.client.post(
            f'/api/reinsurance/treaties/{self.treaty_b.treaty_code}/calculate-cession/',
            {'grossLoss': 150000, 'deductible': 50000},
            format='json',
        )
        self.assertEqual(response_calc.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_review_claims_excluded_from_settled_reinsurance_recoveries(self):
        """
        Verify that claims in 'Pending Review' are NOT counted as settled or paid recoveries.
        Only 'Approved' claims contribute to total_reinsurance_recoveries in executive analytics.
        """
        # Create a Pending Review claim ($40,000 recovery)
        Claim.objects.create(
            claim_number='CLM-TEST-REINS-PENDING',
            organization=self.org_a,
            policy=self.policy,
            assigned_adjuster=self.agent_a,
            incident_date=date(2026, 11, 2),
            gross_amount=150000.00,
            deductible=50000.00,
            reinsurance_recovery=40000.00,
            status=Claim.Status.PENDING,
            description='Pending investigation water damage claim.',
        )

        # Create an Approved claim ($60,000 recovery)
        Claim.objects.create(
            claim_number='CLM-TEST-REINS-APPROVED',
            organization=self.org_a,
            policy=self.policy,
            assigned_adjuster=self.agent_a,
            incident_date=date(2026, 10, 15),
            gross_amount=200000.00,
            deductible=50000.00,
            reinsurance_recovery=60000.00,
            status=Claim.Status.APPROVED,
            description='Approved commercial loss claim.',
        )

        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analytics = response.data

        # Total reinsurance recoveries should be exactly $60,000 (from Approved claim only)
        # and MUST NOT include the $40,000 from the Pending Review claim
        self.assertEqual(analytics['totalReinsuranceRecoveries'], 60000.0)
        self.assertEqual(analytics['pendingClaims'], 1)
        self.assertEqual(analytics['approvedClaims'], 1)

    def test_unauthenticated_request_blocked(self):
        """Unauthenticated access to reinsurance treaties must return 401 Unauthorized."""
        self.client.logout()
        response = self.client.get('/api/reinsurance/treaties/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
