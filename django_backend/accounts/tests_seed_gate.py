"""
Tests for the seed_insuresphere demo-seed safety gate.

The demo seed creates accounts with publicly known passwords, so the
command must refuse to run when DEBUG is False unless the operator has
explicitly set INSURESPHERE_ALLOW_DEMO_SEED=true. Local development
(DEBUG=True) must keep working unchanged.
"""

import os
from unittest import mock

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import Organization, User


class SeedGateTests(TestCase):
    def test_refuses_in_non_debug_without_flag_and_creates_nothing(self):
        env = {k: v for k, v in os.environ.items()
               if k != 'INSURESPHERE_ALLOW_DEMO_SEED'}
        with override_settings(DEBUG=False), mock.patch.dict(os.environ, env, clear=True):
            call_command('seed_insuresphere')
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(Organization.objects.count(), 0)

    def test_runs_in_non_debug_with_explicit_flag(self):
        with override_settings(DEBUG=False), mock.patch.dict(
            os.environ, {'INSURESPHERE_ALLOW_DEMO_SEED': 'true'}
        ):
            call_command('seed_insuresphere')
        self.assertTrue(
            User.objects.filter(email='elena.vance@insuresphere.ai').exists()
        )

    def test_still_works_in_debug_without_flag(self):
        env = {k: v for k, v in os.environ.items()
               if k != 'INSURESPHERE_ALLOW_DEMO_SEED'}
        with override_settings(DEBUG=True), mock.patch.dict(os.environ, env, clear=True):
            call_command('seed_insuresphere')
        self.assertTrue(
            User.objects.filter(email='elena.vance@insuresphere.ai').exists()
        )
