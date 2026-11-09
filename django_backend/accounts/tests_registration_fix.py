"""Regression tests for the registration privilege-escalation fix.

CONFLICT NOTE: the pre-existing ``accounts/tests.py``
``test_user_registration_creates_account_and_returns_jwt`` registers
*unauthenticated* with ``role='Agent'`` and expects ``Agent`` back — i.e. it
asserts the vulnerable behaviour this fix removes. That test cannot pass
together with the fix; it is flagged in the delivery report rather than
edited (existing test files were out of scope).
"""

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Organization, User


class RegistrationPrivilegeEscalationTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(
            name='Fix Registration Syndicate',
            slug='fix-registration-syndicate',
            naic_company_code='NAIC-FIX-REG',
        )
        self.admin = User.objects.create_user(
            email='fix.admin@insuresphere.ai', password='StrongAdminPassword2026!',
            name='Fix Admin', role=User.Role.ADMIN, organization=self.org,
        )
        self.agent = User.objects.create_user(
            email='fix.agent@insuresphere.ai', password='StrongAgentPassword2026!',
            name='Fix Agent', role=User.Role.AGENT, organization=self.org,
        )
        self.register_url = reverse('auth-register')

    def _register_payload(self, email, role=None):
        payload = {
            'email': email,
            'name': 'New Registrant',
            'password': 'StrongRegistrantPass2026!',
            'organization_name': 'Fix Registration Syndicate',
        }
        if role is not None:
            payload['role'] = role
        return payload

    def test_public_registration_as_admin_is_downgraded_to_customer(self):
        response = self.client.post(
            self.register_url, self._register_payload('attacker@example.com', role='Admin'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Customer')
        created = User.objects.get(email='attacker@example.com')
        self.assertEqual(created.role, User.Role.CUSTOMER)

    def test_public_registration_as_agent_is_downgraded_to_customer(self):
        response = self.client.post(
            self.register_url, self._register_payload('wannabe.agent@example.com', role='Agent'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Customer')
        created = User.objects.get(email='wannabe.agent@example.com')
        self.assertEqual(created.role, User.Role.CUSTOMER)

    def test_public_registration_without_role_creates_customer(self):
        response = self.client.post(
            self.register_url, self._register_payload('plain@example.com'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Customer')

    def test_authenticated_admin_may_create_agent_account(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.register_url, self._register_payload('created.agent@insuresphere.ai', role='Agent'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Agent')

    def test_authenticated_admin_may_create_admin_account(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.register_url, self._register_payload('created.admin@insuresphere.ai', role='Admin'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Admin')

    def test_authenticated_agent_cannot_create_admin_account(self):
        self.client.force_authenticate(user=self.agent)
        response = self.client.post(
            self.register_url, self._register_payload('agent.made@example.com', role='Admin'), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user']['role'], 'Customer')


class RefreshCookieSecureFlagTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(
            name='Fix Cookie Syndicate', slug='fix-cookie-syndicate', naic_company_code='NAIC-FIX-CK',
        )
        self.user = User.objects.create_user(
            email='fix.cookie@insuresphere.ai', password='StrongCookiePassword2026!',
            name='Cookie User', role=User.Role.ADMIN, organization=self.org,
        )
        self.login_url = reverse('auth-login')

    def _login(self):
        return self.client.post(
            self.login_url,
            {'email': 'fix.cookie@insuresphere.ai', 'password': 'StrongCookiePassword2026!'},
            format='json',
        )

    @override_settings(DEBUG=True)
    def test_refresh_cookie_not_secure_in_debug_dev(self):
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cookie = response.cookies['insuresphere_refresh_token']
        self.assertTrue(cookie['httponly'])
        self.assertFalse(bool(cookie['secure']))

    @override_settings(DEBUG=False)
    def test_refresh_cookie_secure_in_production(self):
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cookie = response.cookies['insuresphere_refresh_token']
        self.assertTrue(cookie['httponly'])
        self.assertTrue(bool(cookie['secure']))
