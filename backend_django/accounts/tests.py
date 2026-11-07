"""
DRF API Tests for Accounts, JWT Authentication, and Role-Based Access Control.
Run with: `python manage.py test accounts`
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Organization, User


class AccountsAuthenticationTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(
            name='InsureSphere Global Syndicate',
            slug='insuresphere-global-syndicate',
            naic_company_code='NAIC-ISGS-2026',
        )
        self.admin_user = User.objects.create_user(
            email='elena.vance@insuresphere.ai',
            password='StrongPassword2026!',
            name='Elena Vance',
            role=User.Role.ADMIN,
            organization=self.org,
        )

    def test_jwt_login_returns_tokens_and_role_claims(self):
        url = reverse('auth-login')
        response = self.client.post(
            url,
            {'email': 'elena.vance@insuresphere.ai', 'password': 'StrongPassword2026!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], 'Admin')

    def test_user_registration_creates_account_and_returns_jwt(self):
        url = reverse('auth-register')
        response = self.client.post(
            url,
            {
                'email': 'new.agent@insuresphere.ai',
                'name': 'Marcus Sterling',
                'password': 'StrongAgentPassword2026!',
                'role': 'Agent',
                'organization_name': 'InsureSphere Global Syndicate',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['role'], 'Agent')
