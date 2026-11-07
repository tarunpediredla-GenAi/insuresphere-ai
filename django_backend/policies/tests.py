"""API tests for authenticated policy creation and organization isolation."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from reinsurance.models import ReinsuranceTreaty


class PolicyAPITests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name='Policy Test Carrier',
            slug='policy-test-carrier',
            naic_company_code='NAIC-POLICY-TEST',
        )
        self.agent = get_user_model().objects.create_user(
            email='policy-agent@example.com',
            password='StrongPolicyPassword2026!',
            name='Policy Agent',
            role='Agent',
            organization=self.organization,
        )
        self.customer = Customer.objects.create(
            customer_code='CUST-POLICY-1',
            organization=self.organization,
            name='Policy Test Insured',
            contact_person='Test Contact',
            email='insured@example.com',
            industry='Manufacturing',
            risk_score=35,
        )
        today = date.today()
        self.treaty = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-POLICY-1',
            organization=self.organization,
            name='Policy Test Treaty',
            reinsurer_name='Test Reinsurer',
            effective_date=today,
            expiration_date=today + timedelta(days=365),
        )
        self.payload = {
            'title': 'Commercial Property Coverage',
            'customerId': self.customer.customer_code,
            'lineOfBusiness': 'Commercial Property',
            'coverageLimit': 10000000,
            'deductible': 50000,
            'annualPremium': 240000,
            'paymentFrequency': 'Annual',
            'effectiveDate': today.isoformat(),
            'expirationDate': (today + timedelta(days=365)).isoformat(),
            'reinsuranceTreatyId': self.treaty.treaty_code,
            'coverageSummary': 'Scheduled facilities and business interruption coverage.',
            'exclusions': 'Standard policy exclusions.',
        }

    def test_authenticated_agent_can_create_policy(self):
        self.client.force_authenticate(user=self.agent)
        response = self.client.post('/api/policies/', self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['customerId'], self.customer.customer_code)
        self.assertEqual(response.data['policyNumber'].startswith('POL-COM-'), True)
        self.assertEqual(response.data['coverageLimit'], 10000000.0)
        self.assertEqual(response.data['deductible'], 50000.0)
        self.assertEqual(response.data['annualPremium'], 240000.0)

    def test_saved_policy_can_be_retrieved(self):
        self.client.force_authenticate(user=self.agent)
        create_response = self.client.post('/api/policies/', self.payload, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        policy_number = create_response.data['policyNumber']

        retrieve_response = self.client.get(f'/api/policies/{policy_number}/')
        self.assertEqual(retrieve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve_response.data['customerId'], self.customer.customer_code)
        self.assertEqual(retrieve_response.data['annualPremium'], 240000.0)

    def test_customer_from_another_organization_is_rejected(self):
        other_organization = Organization.objects.create(
            name='Other Policy Carrier',
            slug='other-policy-carrier',
            naic_company_code='NAIC-OTHER-POLICY',
        )
        other_customer = Customer.objects.create(
            customer_code='CUST-POLICY-2',
            organization=other_organization,
            name='Other Insured',
            contact_person='Other Contact',
            email='other-insured@example.com',
            industry='Technology',
            risk_score=25,
        )
        self.client.force_authenticate(user=self.agent)
        payload = {**self.payload, 'customerId': other_customer.customer_code}
        response = self.client.post('/api/policies/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('error', response.data)
        self.assertIn('customerId', errors)
        error_msg = str(errors['customerId'])
        self.assertIn('Customer was not found in your organization.', error_msg)

    def test_user_without_organization_cannot_create_policy(self):
        user_no_org = get_user_model().objects.create_user(
            email='no-org-agent@example.com',
            password='StrongPolicyPassword2026!',
            name='No Org Agent',
            role='Agent',
            organization=None,
        )
        self.client.force_authenticate(user=user_no_org)
        response = self.client.post('/api/policies/', self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('error', response.data)
        self.assertIn('customerId', errors)

    def test_policy_creation_with_numeric_customer_id(self):
        self.client.force_authenticate(user=self.agent)
        payload = {**self.payload, 'customerId': str(self.customer.id)}
        response = self.client.post('/api/policies/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['customerId'], self.customer.customer_code)

    def test_nonexistent_customer_is_rejected(self):
        self.client.force_authenticate(user=self.agent)
        payload = {**self.payload, 'customerId': 'CUST-NONEXISTENT-9999'}
        response = self.client.post('/api/policies/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('error', response.data)
        self.assertIn('customerId', errors)
        self.assertIn('Customer was not found in your organization.', str(errors['customerId']))

    def test_policy_creation_without_reinsurance_treaty(self):
        self.client.force_authenticate(user=self.agent)
        payload = {**self.payload, 'reinsuranceTreatyId': ''}
        response = self.client.post('/api/policies/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_reinsurance_treaty_from_another_organization_is_rejected(self):
        other_organization = Organization.objects.create(
            name='Treaty Test Carrier',
            slug='treaty-test-carrier',
            naic_company_code='NAIC-TREATY-TEST',
        )
        other_treaty = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-OTHER-1',
            organization=other_organization,
            name='Other Organization Treaty',
            reinsurer_name='Other Reinsurer',
            effective_date=date.today(),
            expiration_date=date.today() + timedelta(days=365),
        )
        self.client.force_authenticate(user=self.agent)
        payload = {**self.payload, 'reinsuranceTreatyId': other_treaty.treaty_code}
        response = self.client.post('/api/policies/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('error', response.data)
        self.assertIn('reinsuranceTreatyId', errors)
        self.assertIn('Reinsurance treaty was not found in your organization.', str(errors['reinsuranceTreatyId']))
