"""
Customers App Models for InsureSphere AI.
Implements organization-level multi-tenancy, field validation, and PostgreSQL constraints.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from accounts.models import Organization, User


class Customer(models.Model):
    class AccountType(models.TextChoices):
        CORPORATE = 'Corporate', 'Corporate Enterprise'
        SME = 'SME', 'Small & Medium Enterprise'
        INDIVIDUAL = 'Individual', 'Individual Policyholder'

    class RiskTier(models.TextChoices):
        LOW = 'Low Risk', 'Low Risk'
        MODERATE = 'Moderate Risk', 'Moderate Risk'
        HIGH = 'High Exposure', 'High Exposure'

    class Status(models.TextChoices):
        ACTIVE = 'Active', 'Active'
        INACTIVE = 'Inactive', 'Inactive / Deactivated'

    customer_code = models.CharField(
        max_length=24,
        unique=True,
        db_index=True,
        help_text='Human-readable identifier such as CUST-1001',
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='customers',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_customers',
    )
    name = models.CharField(max_length=200, db_index=True)
    contact_person = models.CharField(max_length=150)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=40, blank=True, default='+1 (312) 555-0100')
    account_type = models.CharField(
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.CORPORATE,
    )
    industry = models.CharField(max_length=120)
    risk_tier = models.CharField(
        max_length=30,
        choices=RiskTier.choices,
        default=RiskTier.LOW,
    )
    risk_score = models.PositiveSmallIntegerField(
        default=30,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    kyc_status = models.CharField(max_length=40, default='Verified')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    city = models.CharField(max_length=120, default='Chicago, IL')
    annual_revenue = models.CharField(max_length=60, default='$50,000,000')
    joined_date = models.DateField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customers_customer'
        ordering = ['-joined_date', 'name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(risk_score__gte=1) & models.Q(risk_score__lte=100),
                name='customer_risk_score_between_1_and_100',
            ),
            models.UniqueConstraint(
                fields=['organization', 'email'],
                name='unique_customer_email_per_organization',
            ),
        ]

    def __str__(self):
        return f"{self.customer_code} - {self.name}"
