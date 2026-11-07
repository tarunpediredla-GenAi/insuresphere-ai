"""
Reinsurance Treaty Models for InsureSphere AI.
Enforces actuarial retention + cession percentage integrity at the PostgreSQL level.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models import F
from accounts.models import Organization


class ReinsuranceTreaty(models.Model):
    class TreatyType(models.TextChoices):
        QUOTA_SHARE = 'Proportional Quota Share', 'Proportional Quota Share'
        SURPLUS_SHARE = 'Surplus Share', 'Surplus Share'
        XOL = 'Excess of Loss (XoL)', 'Excess of Loss (XoL)'
        FACULTATIVE = 'Facultative Certificate', 'Facultative Certificate'

    treaty_code = models.CharField(max_length=24, unique=True, db_index=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='reinsurance_treaties',
    )
    name = models.CharField(max_length=200)
    treaty_type = models.CharField(
        max_length=40,
        choices=TreatyType.choices,
        default=TreatyType.QUOTA_SHARE,
    )
    reinsurer_name = models.CharField(max_length=180)
    sp_rating = models.CharField(max_length=10, default='AA-')
    cedant_retention_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=60.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    ceded_share_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=40.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    treaty_limit = models.DecimalField(max_digits=14, decimal_places=2, default=25000000.00)
    attachment_point = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    ceded_premium_ytd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    recoveries_collected_ytd = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    pending_recoveries = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    effective_date = models.DateField()
    expiration_date = models.DateField()
    status = models.CharField(max_length=20, default='Active')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reinsurance_treaty'
        ordering = ['treaty_code']
        constraints = [
            models.CheckConstraint(
                check=models.Q(cedant_retention_pct=100 - F('ceded_share_pct')),
                name='retention_plus_ceded_equals_100',
            ),
            models.CheckConstraint(
                check=models.Q(expiration_date__gt=F('effective_date')),
                name='treaty_expiration_after_effective_date',
            ),
        ]

    def calculate_recovery(self, gross_loss: float, deductible: float) -> dict:
        net_eligible = max(0.0, float(gross_loss) - float(deductible))
        limit = float(self.treaty_limit)
        attachment = float(self.attachment_point)
        ceded_pct = float(self.ceded_share_pct) / 100.0

        if 'Excess of Loss' in self.treaty_type:
            excess_subject = max(0.0, net_eligible - attachment)
            ceded_amount = min(limit, round(excess_subject * ceded_pct, 2))
        else:
            ceded_amount = min(limit, round(net_eligible * ceded_pct, 2))

        retained_amount = round(net_eligible - ceded_amount, 2)
        return {
            'grossLoss': gross_loss,
            'deductible': deductible,
            'netEligibleLoss': net_eligible,
            'cededRecoveryAmount': ceded_amount,
            'cedantRetainedAmount': retained_amount,
            'cashCallTriggered': ceded_amount >= 250000.0,
        }

    def __str__(self):
        return f"{self.treaty_code} - {self.name} ({self.ceded_share_pct}% Ceded)"
