"""
DRF API Tests for Customer CRUD, Validation, and Organization Data Isolation.
Run with: `python manage.py test customers`
"""

from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import Organization, User
from .models import Customer


class CustomerAPITests(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(
            name='Carrier Syndicate A',
            slug='carrier-syndicate-a',
            naic_company_code='NAIC-SYNA-2026',
        )
        self.org_b = Organization.objects.create(
            name='Carrier Syndicate B',
            slug='carrier-syndicate-b',
            naic_company_code='NAIC-SYNB-2026',
        )
        self.agent_a = User.objects.create_user(
            email='agent@syndicate-a.com',
            password='StrongPassword2026!',
            name='Agent A',
            role=User.Role.AGENT,
            organization=self.org_a,
        )
        self.customer_b = Customer.objects.create(
            customer_code='CUST-9999',
            organization=self.org_b,
            name='Confidential Org B Client',
            contact_person='Bob B',
            email='bob@orgb.com',
            industry='Aerospace',
            risk_score=40,
        )

    def test_agent_can_create_customer_and_cannot_see_other_org_customers(self):
        self.client.force_authenticate(user=self.agent_a)
        create_res = self.client.post(
            '/api/customers/',
            {
                'name': 'Meridian Global Logistics',
                'contactPerson': 'Alistair Finch',
                'email': 'afinch@meridian.com',
                'accountType': 'Corporate',
                'industry': 'Maritime',
                'riskTier': 'Moderate Risk',
                'riskScore': 42,
            },
            format='json',
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)

        list_res = self.client.get('/api/customers/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        results = list_res.data.get('results', list_res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'Meridian Global Logistics')
