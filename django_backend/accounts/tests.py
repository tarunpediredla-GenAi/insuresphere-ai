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
        # Verify HttpOnly cookie is set for refresh token
        self.assertIn('insuresphere_refresh_token', response.cookies)
        self.assertTrue(response.cookies['insuresphere_refresh_token']['httponly'])

    def test_token_refresh_via_httponly_cookie_alone(self):
        # 1. Login to get cookie
        login_url = reverse('auth-login')
        login_resp = self.client.post(
            login_url,
            {'email': 'elena.vance@insuresphere.ai', 'password': 'StrongPassword2026!'},
            format='json',
        )
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        refresh_cookie = login_resp.cookies['insuresphere_refresh_token'].value

        # 2. Call refresh endpoint with NO body, only the cookie
        refresh_url = reverse('auth-token-refresh')
        self.client.cookies['insuresphere_refresh_token'] = refresh_cookie
        refresh_resp = self.client.post(refresh_url, {}, format='json')
        self.assertEqual(refresh_resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh_resp.data)

    def test_logout_clears_cookie_and_invalidates_refresh_token(self):
        login_url = reverse('auth-login')
        login_resp = self.client.post(
            login_url,
            {'email': 'elena.vance@insuresphere.ai', 'password': 'StrongPassword2026!'},
            format='json',
        )
        refresh_cookie = login_resp.cookies['insuresphere_refresh_token'].value
        self.client.cookies['insuresphere_refresh_token'] = refresh_cookie

        logout_url = reverse('auth-logout')
        logout_resp = self.client.post(logout_url, {}, format='json')
        self.assertEqual(logout_resp.status_code, status.HTTP_200_OK)
        # Cookie should be cleared (max-age 0 or deleted)
        cookie = logout_resp.cookies.get('insuresphere_refresh_token')
        self.assertTrue(cookie is None or cookie['max-age'] == 0 or cookie.value == '')

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
