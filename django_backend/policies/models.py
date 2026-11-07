"""
Insurance Policy Models for InsureSphere AI.
Links Customers, Underwriters, and Reinsurance Treaties with PostgreSQL CheckConstraints.
"""

from django.db import models
from django.db.models import F
from django.core.validators import MinValueValidator
from accounts.models import Organization, User
from customers.models import Customer
from reinsurance.models import ReinsuranceTreaty


class Policy(models.Model):
    class LineOfBusiness(models.TextChoices):
        COMMERCIAL_PROPERTY = 'Commercial Property', 'Commercial Property'
        CYBER_LIABILITY = 'Cyber Liability', 'Cyber Liability'
        MARINE_CARGO = 'Marine Cargo', 'Marine Cargo'
        GENERAL_LIABILITY = 'General & Product Liability', 'General & Product Liability'
        ENERGY = 'Energy & Infrastructure', 'Energy & Infrastructure'
        AVIATION = 'Aviation & Aerospace', 'Aviation & Aerospace'

    policy_number = models.CharField(max_length=32, unique=True, db_index=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='policies',
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='policies',
    )
    underwriter = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='underwritten_policies',
    )
    reinsurance_treaty = models.ForeignKey(
        ReinsuranceTreaty,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='covered_policies',
    )
    title = models.CharField(max_length=220)
    line_of_business = models.CharField(
        max_length=50,
        choices=LineOfBusiness.choices,
        default=LineOfBusiness.COMMERCIAL_PROPERTY,
        db_index=True,
    )
    coverage_limit = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(10000)],
    )
    deductible = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    annual_premium = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(500)],
    )
    payment_frequency = models.CharField(max_length=25, default='Annual')
    effective_date = models.DateField()
    expiration_date = models.DateField()
    renewal_status = models.CharField(max_length=30, default='Active', db_index=True)
    ceded_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=40.00)
    coverage_summary = models.TextField()
    exclusions = models.TextField(blank=True, default='Standard commercial war, nuclear, and wear-and-tear exclusions apply.')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'policies_policy'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(coverage_limit__gt=F('deductible')),
                name='policy_limit_greater_than_deductible',
            ),
            models.CheckConstraint(
                check=models.Q(expiration_date__gt=F('effective_date')),
                name='policy_expiration_after_effective_date',
            ),
        ]

    def __str__(self):
        return f"{self.policy_number} ({self.customer.name})"
