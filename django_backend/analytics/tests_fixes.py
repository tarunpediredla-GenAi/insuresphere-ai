"""Regression tests for the analytics labelling / loss-ratio fixes:

- Pending/SIU recoveries are *estimated*, never settled/collected money.
- Stage-split fields: estimated / approved / billed / collected recoveries.
- lossRatio uses incurred volume (Rejected claims excluded), while
  totalClaimsVolume remains gross submitted volume.
"""

from datetime import date
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Organization
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim


class AnalyticsRecoveryStageAndLossRatioTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.org = Organization.objects.create(
            name='Fix Analytics Carrier', slug='fix-analytics', naic_company_code='NAIC-FIX-AN',
        )
        self.admin = User.objects.create_user(
            email='fix.actuary@example.com', password='StrongAdminPassword2026!',
            name='Fix Actuary', role='Admin', organization=self.org,
        )
        customer = Customer.objects.create(
            customer_code='CUST-FIX-AN1', organization=self.org, name='Analytics Holdings',
            contact_person='CFO', email='cfo@analyticsholdings.example.com',
            industry='Manufacturing', risk_score=40,
        )
        self.policy = Policy.objects.create(
            policy_number='POL-FIX-AN1', organization=self.org, customer=customer,
            underwriter=self.admin, title='Analytics Policy', line_of_business='Commercial Property',
            coverage_limit=10000000, deductible=25000, annual_premium=250000,
            effective_date=date(2026, 1, 1), expiration_date=date(2026, 12, 31),
            ceded_percentage=40,
        )

        def claim(number, gross, recovery, claim_status, **kwargs):
            return Claim.objects.create(
                claim_number=number, organization=self.org, policy=self.policy,
                incident_date=date(2026, 6, 1), gross_amount=gross, deductible=25000,
                reinsurance_recovery=recovery, status=claim_status,
                description=f'{number} fixture.', **kwargs,
            )

        # Approved: recovery $40k, of which $30k billed and $20k collected.
        claim('CLM-FIX-AN-APP', 125000, 40000, Claim.Status.APPROVED,
              recovery_stage=Claim.RecoveryStage.COLLECTED,
              recovery_billed_amount=30000, recovery_collected_amount=20000)
        # Pending Review: recovery $20k — estimate only.
        claim('CLM-FIX-AN-PEND', 75000, 20000, Claim.Status.PENDING)
        # SIU Investigation: recovery $10k — estimate only.
        claim('CLM-FIX-AN-SIU', 50000, 10000, Claim.Status.SIU)
        # Rejected: gross $100k and a nominal $50k recovery — counts nowhere
        # except gross submitted volume / rejected count.
        claim('CLM-FIX-AN-REJ', 100000, 50000, Claim.Status.REJECTED)

        self.url = '/api/dashboard/analytics/'

    def test_recovery_stage_breakdown(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['estimatedRecoveries'], 30000.0)   # 20k pending + 10k SIU
        self.assertEqual(data['approvedRecoveries'], 40000.0)
        self.assertEqual(data['billedRecoveries'], 30000.0)
        self.assertEqual(data['collectedRecoveries'], 20000.0)
        # Backward-compatible field = approved recoveries only; pending/SIU
        # estimates must NOT leak into it.
        self.assertEqual(data['totalReinsuranceRecoveries'], 40000.0)

    def test_loss_ratio_excludes_rejected_claims(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        # Gross submitted: 125k + 75k + 50k + 100k (rejected) = 350k
        self.assertEqual(data['totalClaimsVolume'], 350000.0)
        # Incurred excludes the rejected $100k: 250k
        self.assertEqual(data['incurredClaimsVolume'], 250000.0)
        # Loss ratio = incurred 250k / premium 250k = 100.0 (not 350k/250k = 140.0)
        self.assertEqual(data['lossRatio'], 100.0)
        self.assertEqual(data['rejectedClaims'], 1)
