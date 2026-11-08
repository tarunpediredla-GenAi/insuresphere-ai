"""Comprehensive Security, RBAC, and Multi-Tenant Isolation Audit Tests for InsureSphere AI."""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim
from reinsurance.models import ReinsuranceTreaty


class ComprehensiveSecurityRBACAuditTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        # Tenant 1: Syndicate A
        self.org_a = Organization.objects.create(
            name='Syndicate A Insurance Corp',
            slug='syndicate-a',
            naic_company_code='NAIC-SEC-A',
        )
        self.admin_a = User.objects.create_user(
            email='admin.a@syndicate-a.com',
            password='StrongAdminPassword2026!',
            name='Admin A',
            role=User.Role.ADMIN,
            organization=self.org_a,
        )
        self.agent_a = User.objects.create_user(
            email='agent.a@syndicate-a.com',
            password='StrongAgentPassword2026!',
            name='Agent A',
            role=User.Role.AGENT,
            organization=self.org_a,
        )
        self.customer_a = User.objects.create_user(
            email='customer.a@domain-a.com',
            password='StrongCustomerPass2026!',
            name='Policyholder A',
            role=User.Role.CUSTOMER,
            organization=self.org_a,
        )

        # Tenant 2: Syndicate B (Competitor)
        self.org_b = Organization.objects.create(
            name='Syndicate B Reinsurance Group',
            slug='syndicate-b',
            naic_company_code='NAIC-SEC-B',
        )
        self.admin_b = User.objects.create_user(
            email='admin.b@syndicate-b.com',
            password='StrongAdminPassword2026!',
            name='Admin B',
            role=User.Role.ADMIN,
            organization=self.org_b,
        )

        # Seed Records in Org A
        self.cust_record_a = Customer.objects.create(
            customer_code='CUST-SEC-A01',
            organization=self.org_a,
            name='Tenant A Logistics',
            contact_person='Contact A',
            email='customer.a@domain-a.com',
            industry='Logistics',
            risk_score=30,
        )
        self.treaty_a = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-SEC-A01',
            organization=self.org_a,
            name='Treaty A 60/40',
            cedant_retention_pct=60,
            ceded_share_pct=40,
            treaty_limit=20000000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
        )
        self.policy_a = Policy.objects.create(
            policy_number='POL-SEC-A01',
            organization=self.org_a,
            customer=self.cust_record_a,
            underwriter=self.agent_a,
            reinsurance_treaty=self.treaty_a,
            title='Commercial Policy A',
            line_of_business='Commercial Property',
            coverage_limit=10000000,
            deductible=25000,
            annual_premium=150000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )
        self.claim_a = Claim.objects.create(
            claim_number='CLM-SEC-A01',
            organization=self.org_a,
            policy=self.policy_a,
            assigned_adjuster=self.agent_a,
            incident_date=date(2026, 5, 1),
            gross_amount=100000,
            deductible=25000,
            reinsurance_recovery=30000,
            status=Claim.Status.PENDING,
            description='Claim in Org A.',
        )

        # Seed Records in Org B
        self.cust_record_b = Customer.objects.create(
            customer_code='CUST-SEC-B01',
            organization=self.org_b,
            name='Tenant B Maritime',
            contact_person='Contact B',
            email='contact.b@domain-b.com',
            industry='Maritime',
            risk_score=45,
        )
        self.treaty_b = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-SEC-B01',
            organization=self.org_b,
            name='Treaty B 50/50',
            cedant_retention_pct=50,
            ceded_share_pct=50,
            treaty_limit=15000000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
        )
        self.policy_b = Policy.objects.create(
            policy_number='POL-SEC-B01',
            organization=self.org_b,
            customer=self.cust_record_b,
            underwriter=self.admin_b,
            title='Commercial Policy B',
            line_of_business='Marine Cargo',
            coverage_limit=8000000,
            deductible=50000,
            annual_premium=300000,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            ceded_percentage=50,
        )
        self.claim_b = Claim.objects.create(
            claim_number='CLM-SEC-B01',
            organization=self.org_b,
            policy=self.policy_b,
            incident_date=date(2026, 4, 1),
            gross_amount=250000,
            deductible=50000,
            reinsurance_recovery=100000,
            status=Claim.Status.PENDING,
            description='Claim in Org B.',
        )

    # 1. Customer Role Boundaries
    def test_customer_role_cannot_create_policy(self):
        """Policyholders (role Customer) cannot bind policies (HTTP 403)."""
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post(
            '/api/policies/',
            {
                'title': 'Unauthorized Policy',
                'customerId': self.cust_record_a.customer_code,
                'lineOfBusiness': 'Commercial Property',
                'coverageLimit': 1000000,
                'deductible': 10000,
                'annualPremium': 20000,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_role_cannot_review_claims(self):
        """Policyholders cannot approve, hold, or reject claims (HTTP 403)."""
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.patch(
            f'/api/claims/{self.claim_a.claim_number}/',
            {'action': 'Approve', 'reviewerNote': 'Self-approval'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_role_cannot_create_treaty(self):
        """Policyholders cannot create reinsurance treaties (HTTP 403)."""
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.post(
            '/api/reinsurance/treaties/',
            {
                'name': 'Unauthorized Treaty',
                'type': 'Proportional Quota Share',
                'reinsurerName': 'Unauthorized Re',
                'cededSharePct': 40,
                'treatyLimit': 10000000,
                'effectiveDate': '2026-01-01',
                'expirationDate': '2026-12-31',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_role_cannot_view_confidential_analytics(self):
        """Policyholders cannot access executive dashboard analytics with confidential financials (HTTP 403)."""
        self.client.force_authenticate(user=self.customer_a)
        response = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 2. Multi-Tenant Organization Boundaries
    def test_cross_tenant_customers_isolation(self):
        """Tenant A cannot see Tenant B customers in directory listing or detail view."""
        self.client.force_authenticate(user=self.admin_a)
        list_resp = self.client.get('/api/customers/')
        codes = [c['id'] for c in list_resp.data.get('results', list_resp.data)]
        self.assertIn(self.cust_record_a.customer_code, codes)
        self.assertNotIn(self.cust_record_b.customer_code, codes)

        detail_resp = self.client.get(f'/api/customers/{self.cust_record_b.customer_code}/')
        self.assertEqual(detail_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_policies_isolation(self):
        """Tenant A cannot see Tenant B policies."""
        self.client.force_authenticate(user=self.admin_a)
        list_resp = self.client.get('/api/policies/')
        numbers = [p['policyNumber'] for p in list_resp.data.get('results', list_resp.data)]
        self.assertIn(self.policy_a.policy_number, numbers)
        self.assertNotIn(self.policy_b.policy_number, numbers)

        detail_resp = self.client.get(f'/api/policies/{self.policy_b.policy_number}/')
        self.assertEqual(detail_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_claims_isolation(self):
        """Tenant A cannot view or adjudicate Tenant B claims."""
        self.client.force_authenticate(user=self.agent_a)
        list_resp = self.client.get('/api/claims/')
        claim_nums = [c['claimNumber'] for c in list_resp.data.get('results', list_resp.data)]
        self.assertIn(self.claim_a.claim_number, claim_nums)
        self.assertNotIn(self.claim_b.claim_number, claim_nums)

        patch_resp = self.client.patch(
            f'/api/claims/{self.claim_b.claim_number}/',
            {'action': 'Approve', 'reviewerNote': 'Cross-tenant attempt'},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_treaties_isolation(self):
        """Tenant A cannot view Tenant B treaties."""
        self.client.force_authenticate(user=self.admin_a)
        list_resp = self.client.get('/api/reinsurance/treaties/')
        treaty_codes = [t['treatyCode'] for t in list_resp.data.get('results', list_resp.data)]
        self.assertIn(self.treaty_a.treaty_code, treaty_codes)
        self.assertNotIn(self.treaty_b.treaty_code, treaty_codes)

        detail_resp = self.client.get(f'/api/reinsurance/treaties/{self.treaty_b.treaty_code}/')
        self.assertEqual(detail_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_analytics_isolation(self):
        """Syndicate A cannot see Syndicate B's premium or claims volume on executive dashboard."""
        self.client.force_authenticate(user=self.admin_a)
        resp_a = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        # Org A has policy_a annual_premium=150,000 and claim_a gross=100,000
        self.assertEqual(resp_a.data['totalPremiumRevenue'], 150000.0)
        self.assertEqual(resp_a.data['totalClaimsVolume'], 100000.0)

        self.client.force_authenticate(user=self.admin_b)
        resp_b = self.client.get('/api/dashboard/analytics/')
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)
        # Org B has policy_b annual_premium=300,000 and claim_b gross=250,000
        self.assertEqual(resp_b.data['totalPremiumRevenue'], 300000.0)
        self.assertEqual(resp_b.data['totalClaimsVolume'], 250000.0)

    # 3. Password Validation Enforcement
    def test_short_password_fails_registration(self):
        """Passwords shorter than 10 characters are rejected by validators."""
        url = '/api/auth/register/'
        response = self.client.post(
            url,
            {
                'email': 'shortpass@example.com',
                'name': 'Short Pass',
                'password': 'short',
                'role': 'Agent',
                'organization_name': 'Test Org',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
