"""
Accounts & Multi-Tenant Organization Models for InsureSphere AI.
Implements Organization-level isolation and Role-Based Access Control (Admin, Agent, Customer).
"""

import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.core.validators import RegexValidator


class Organization(models.Model):
    """
    Represents an Insurance Carrier / MGA / Underwriting Syndicate tenant.
    Every User, Customer, Policy, Claim, and Reinsurance Treaty belongs to an Organization
    to guarantee strict multi-tenant data isolation at the PostgreSQL query level.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    naic_company_code = models.CharField(
        max_length=20,
        unique=True,
        validators=[RegexValidator(r'^[A-Z0-9\-]+$', 'NAIC code must be uppercase alphanumeric.')],
    )
    domicile_country = models.CharField(max_length=80, default='United States')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'accounts_organization'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.naic_company_code})"


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('A valid corporate email address is required.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', User.Role.ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = 'Admin', 'System Administrator / Chief Underwriting Officer'
        AGENT = 'Agent', 'Licensed Insurance Agent / Claims Adjuster'
        CUSTOMER = 'Customer', 'Policyholder / Corporate Insured Representative'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name='users',
        null=True,
        blank=True,
    )
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=150)
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
        db_index=True,
    )
    title = models.CharField(max_length=120, blank=True, default='Corporate Risk Officer')
    department = models.CharField(max_length=120, blank=True, default='Commercial Risk')
    license_number = models.CharField(max_length=60, blank=True, default='PENDING-VERIFICATION')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'accounts_user'
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                check=models.Q(role__in=['Admin', 'Agent', 'Customer']),
                name='valid_user_role_choice',
            )
        ]

    @property
    def role_permissions(self):
        if self.role == self.Role.ADMIN:
            return [
                'customers:write',
                'policies:write',
                'claims:approve',
                'reinsurance:manage',
                'analytics:export',
                'users:admin',
            ]
        if self.role == self.Role.AGENT:
            return [
                'customers:write',
                'policies:write',
                'claims:review',
                'ai:analyze',
            ]
        return ['policies:read_own', 'claims:submit', 'ai:policy_qa']

    def __str__(self):
        return f"{self.name} <{self.email}> ({self.role})"
