"""
Claims Management Models for InsureSphere AI.
Includes Claim, SupportingDocument, and immutable ClaimActivityLog audit trail.
"""

from django.db import models
from django.core.validators import MinValueValidator
from accounts.models import Organization, User
from policies.models import Policy


class Claim(models.Model):
    class Status(models.TextChoices):
        PENDING = 'Pending Review', 'Pending Review'
        APPROVED = 'Approved', 'Approved'
        REJECTED = 'Rejected', 'Rejected'
        SIU = 'SIU Investigation', 'SIU Investigation'

    class RecoveryStage(models.TextChoices):
        """Reinsurance recovery lifecycle. ``reinsurance_recovery`` is only an
        *estimate* until a claim is approved; money moves through the stages
        Estimated -> Approved -> Billed -> Collected. Approval alone never
        means the recovery has been billed or collected."""
        ESTIMATED = 'Estimated', 'Estimated'
        APPROVED = 'Approved', 'Approved'
        BILLED = 'Billed', 'Billed'
        COLLECTED = 'Collected', 'Collected'

    claim_number = models.CharField(max_length=32, unique=True, db_index=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='claims',
    )
    policy = models.ForeignKey(
        Policy,
        on_delete=models.PROTECT,
        related_name='claims',
    )
    assigned_adjuster = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_claims',
    )
    incident_date = models.DateField()
    submitted_date = models.DateField(auto_now_add=True)
    gross_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(100)],
    )
    deductible = models.DecimalField(max_digits=12, decimal_places=2, default=25000.00)
    reinsurance_recovery = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    recovery_stage = models.CharField(
        max_length=20,
        choices=RecoveryStage.choices,
        default=RecoveryStage.ESTIMATED,
    )
    recovery_billed_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    recovery_collected_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    priority = models.CharField(max_length=20, default='Medium')
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'claims_claim'
        ordering = ['-created_at']


class SupportingDocument(models.Model):
    claim = models.ForeignKey(
        Claim,
        on_delete=models.CASCADE,
        related_name='supporting_docs',
    )
    name = models.CharField(max_length=220)
    size = models.CharField(max_length=30, default='1.4 MB')
    uploaded_at = models.DateField(auto_now_add=True)

    class Meta:
        db_table = 'claims_supportingdocument'


class ClaimActivityLog(models.Model):
    claim = models.ForeignKey(
        Claim,
        on_delete=models.CASCADE,
        related_name='activity_logs',
    )
    actor = models.CharField(max_length=150)
    action = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'claims_claimactivitylog'
        ordering = ['-timestamp']
