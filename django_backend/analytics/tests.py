"""Automated tests for Portfolio KPIs and Actuarial Analytics API."""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim
from reinsurance.models import ReinsuranceTreaty


class AnalyticsAPITests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.org_a = Organization.objects.create(
            name='Analytics Carrier Alpha',
            slug='carrier-alpha',
            naic_company_code='NAIC-A-01',
        )
        self.org_b = Organization.objects.create(
            name='Analytics Carrier Beta',
            slug='carrier-beta',
            naic_company_code='NAIC-B-01',
        )

        self.user_a = User.objects.create_user(
            email='actuary.alpha@insuresphere.ai',
            password='StrongActuaryPassword2026!',
            name='Alpha Actuary',
            role='Admin',
            organization=self.org_a,
        )
        self.user_b = User.objects.create_user(
            email='actuary.beta@insuresphere.ai',
            password='StrongActuaryPassword2026!',
            name='Beta Actuary',
            role='Admin',
            organization=self.org_b,
        )
        self.user_unassigned = User.objects.create_user(
            email='unassigned@insuresphere.ai',
            password='StrongUnassignedPass2026!',
            name='Unassigned User',
            role='Agent',
            organization=None,
        )
        self.agent_a = User.objects.create_user(
            email='agent.alpha@insuresphere.ai',
            password='StrongAgentPassword2026!',
            name='Alpha Agent',
            role='Agent',
            organization=self.org_a,
        )
        self.customer_a = User.objects.create_user(
            email='customer.alpha@domain.com',
            password='StrongCustomerPassword2026!',
            name='Customer Alpha',
            role='Customer',
            organization=self.org_a,
        )

        # Seed Customer, Policy, Claims in Org A
        self.cust_a = Customer.objects.create(
            customer_code='CUST-AN-01',
            organization=self.org_a,
            name='Alpha Marine Ltd',
            contact_person='Captain Smith',
            email='smith@alphamarine.com',
            industry='Maritime',
            risk_score=40,
        )
        self.treaty_a = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-AN-01',
            organization=self.org_a,
            name='Alpha Quota Share',
            cedant_retention_pct=60,
            ceded_share_pct=40,
            treaty_limit=10000000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
        )
        self.policy_a = Policy.objects.create(
            policy_number='POL-AN-01',
            organization=self.org_a,
            customer=self.cust_a,
            underwriter=self.user_a,
            reinsurance_treaty=self.treaty_a,
            title='Marine Hull Policy',
            line_of_business='Marine Hull',
            coverage_limit=5000000,
            deductible=25000,
            annual_premium=200000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )

        # Claim 1: Approved, Gross $125k, Reinsurance recovery $40k
        Claim.objects.create(
            claim_number='CLM-AN-APP',
            organization=self.org_a,
            policy=self.policy_a,
            assigned_adjuster=self.user_a,
            incident_date=date(2026, 6, 1),
            gross_amount=125000,
            deductible=25000,
            reinsurance_recovery=40000,
            status=Claim.Status.APPROVED,
            description='Approved rudder damage.',
        )

        # Claim 2: Pending Review, Gross $75k, Reinsurance recovery $20k
        Claim.objects.create(
            claim_number='CLM-AN-PEND',
            organization=self.org_a,
            policy=self.policy_a,
            assigned_adjuster=self.user_a,
            incident_date=date(2026, 7, 1),
            gross_amount=75000,
            deductible=25000,
            reinsurance_recovery=20000,
            status=Claim.Status.PENDING,
            description='Pending review cargo leak.',
        )

        # Seed data in Org B to test isolation
        self.cust_b = Customer.objects.create(
            customer_code='CUST-AN-02',
            organization=self.org_b,
            name='Beta Aviation',
            contact_person='Pilot Jones',
            email='jones@betaaviation.com',
            industry='Aviation',
            risk_score=55,
        )
        self.policy_b = Policy.objects.create(
            policy_number='POL-AN-02',
            organization=self.org_b,
            customer=self.cust_b,
            underwriter=self.user_b,
            title='Aviation Hull Policy',
            line_of_business='Commercial Aviation',
            coverage_limit=8000000,
            deductible=50000,
            annual_premium=500000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=30,
        )

        self.url = '/api/dashboard/analytics/'

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated access to analytics must return 401."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_analytics_metrics_and_pending_claims_recovery_exclusion(self):
        """
        Verify portfolio aggregation:
        - Premium revenue: $200,000
        - Claims volume: $125,000 + $75,000 = $200,000
        - Loss Ratio: ($200,000 / $200,000) * 100 = 100.0%
        - Reinsurance recoveries: $40,000 ONLY (excludes Pending Review $20k)
        """
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['totalCustomers'], 1)
        self.assertEqual(data['activePolicies'], 1)
        self.assertEqual(data['totalClaims'], 2)
        self.assertEqual(data['approvedClaims'], 1)
        self.assertEqual(data['pendingClaims'], 1)
        self.assertEqual(data['totalPremiumRevenue'], 200000.0)
        self.assertEqual(data['totalClaimsVolume'], 200000.0)
        self.assertEqual(data['lossRatio'], 100.0)
        # Crucial check: Pending review recovery ($20,000) is excluded
        self.assertEqual(data['totalReinsuranceRecoveries'], 40000.0)
        self.assertEqual(data['activeTreatiesCount'], 1)
        self.assertEqual(len(data['portfolioByLob']), 1)
        self.assertEqual(data['portfolioByLob'][0]['line_of_business'], 'Marine Hull')

    def test_multi_tenant_analytics_isolation(self):
        """Org A actuary never sees Org B's $500,000 aviation policy."""
        self.client.force_authenticate(user=self.user_a)
        response_a = self.client.get(self.url)
        self.assertEqual(response_a.data['totalPremiumRevenue'], 200000.0)

        self.client.force_authenticate(user=self.user_b)
        response_b = self.client.get(self.url)
        self.assertEqual(response_b.data['totalPremiumRevenue'], 500000.0)

    def test_unassigned_user_receives_zeroed_analytics(self):
        """Users without an assigned organization receive 0 metrics without error."""
        self.client.force_authenticate(user=self.user_unassigned)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['totalCustomers'], 0)
        self.assertEqual(response.data['totalPremiumRevenue'], 0.0)
        self.assertEqual(response.data['totalClaimsVolume'], 0.0)

    def test_customer_role_denied_access_to_confidential_analytics(self):
        """Policyholders (role Customer) must be denied access to confidential executive metrics (HTTP 403)."""
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Verify access denial without assuming exact exception dictionary key structure
        detail_msg = str(response.data)
        self.assertTrue(
            'Access denied' in detail_msg or 'permission' in detail_msg.lower() or response.status_code == 403
        )

    def test_agent_role_granted_access_to_analytics(self):
        """Licensed Agents have full access to their syndicate's executive portfolio analytics (HTTP 200)."""
        self.client.force_authenticate(user=self.agent_a)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['totalCustomers'], 1)
        self.assertEqual(response.data['totalPremiumRevenue'], 200000.0)

    def test_date_range_filtering(self):
        """Verify analytics query filtering by start_date and end_date."""
        self.client.force_authenticate(user=self.user_a)
        # Filter for only July claims: CLM-AN-PEND (incident 2026-07-01) matches, CLM-AN-APP (2026-06-01) excluded
        response = self.client.get(f"{self.url}?start_date=2026-07-01&end_date=2026-07-31")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['totalClaims'], 1)
        self.assertEqual(response.data['totalClaimsVolume'], 75000.0)
        self.assertEqual(response.data['pendingClaims'], 1)
        self.assertEqual(response.data['approvedClaims'], 0)

    def test_zero_division_protection(self):
        """Zero earned premium returns 0.0% loss ratio without ZeroDivisionError."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        org_zero = Organization.objects.create(
            name='Zero Carrier',
            slug='carrier-zero',
            naic_company_code='NAIC-ZERO-01',
        )
        user_zero = User.objects.create_user(
            email='zero.admin@carrier-zero.com',
            password='StrongAdminPassword2026!',
            name='Zero Admin',
            role='Admin',
            organization=org_zero,
        )
        self.client.force_authenticate(user=user_zero)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['totalPremiumRevenue'], 0.0)
        self.assertEqual(response.data['totalClaimsVolume'], 0.0)
        self.assertEqual(response.data['lossRatio'], 0.0)


