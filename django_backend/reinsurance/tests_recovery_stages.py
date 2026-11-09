"""Verification tests for the user's exact reinsurance case:

Treaty TRT-2026-01 — 60% retained / 40% ceded quota share
Gross claim loss $150,000, deductible $50,000
-> Net eligible loss $100,000
-> Insurer (cedant) retained loss $60,000
-> Reinsurer estimated recovery $40,000

Proven both directly via ``ReinsuranceTreaty.calculate_recovery`` and via the
POST calculate-cession API. Fixture pattern follows reinsurance/tests.py.
"""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from reinsurance.models import ReinsuranceTreaty


class TreatyTRT202601VerificationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(
            name='Verification Syndicate',
            slug='verification-syndicate',
            naic_company_code='NAIC-VER-2026',
        )
        self.admin = User.objects.create_user(
            email='verify.admin@insuresphere.ai',
            password='StrongVerifyPassword2026!',
            name='Verification Admin',
            role='Admin',
            organization=self.org,
        )
        self.treaty = ReinsuranceTreaty.objects.create(
            treaty_code='TRT-2026-01',
            organization=self.org,
            name='2026 Commercial Property & Cyber Quota Share Treaty',
            treaty_type=ReinsuranceTreaty.TreatyType.QUOTA_SHARE,
            reinsurer_name='Swiss Re Corporate Solutions (Zurich)',
            sp_rating='AA-',
            cedant_retention_pct=60.00,
            ceded_share_pct=40.00,
            treaty_limit=30000000.00,
            attachment_point=0.00,
            effective_date=date(2026, 1, 1),
            expiration_date=date(2026, 12, 31),
            status='Active',
        )

    def test_treaty_is_60_retained_40_ceded_quota_share(self):
        self.assertEqual(float(self.treaty.cedant_retention_pct), 60.0)
        self.assertEqual(float(self.treaty.ceded_share_pct), 40.0)
        self.assertEqual(float(self.treaty.cedant_retention_pct + self.treaty.ceded_share_pct), 100.0)
        self.assertEqual(self.treaty.treaty_type, ReinsuranceTreaty.TreatyType.QUOTA_SHARE)
        self.assertEqual(self.treaty.status, 'Active')

    def test_model_calculation_gross_150k_deductible_50k(self):
        calc = self.treaty.calculate_recovery(gross_loss=150000.0, deductible=50000.0)
        self.assertEqual(calc['grossLoss'], 150000.0)
        self.assertEqual(calc['deductible'], 50000.0)
        self.assertEqual(calc['netEligibleLoss'], 100000.0)
        self.assertEqual(calc['cedantRetainedAmount'], 60000.0)
        self.assertEqual(calc['cededRecoveryAmount'], 40000.0)
        self.assertFalse(calc['cashCallTriggered'])

    def test_calculate_cession_api_gross_150k_deductible_50k(self):
        self.client.force_authenticate(user=self.admin)
        url = f'/api/reinsurance/treaties/{self.treaty.treaty_code}/calculate-cession/'
        response = self.client.post(url, {'grossLoss': 150000, 'deductible': 50000}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['netEligibleLoss'], 100000.0)
        self.assertEqual(data['cedantRetainedAmount'], 60000.0)
        self.assertEqual(data['cededRecoveryAmount'], 40000.0)
        self.assertFalse(data['cashCallTriggered'])
