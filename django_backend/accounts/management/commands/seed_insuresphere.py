"""
Django Management Command: `python manage.py seed_insuresphere`
Seeds PostgreSQL with the Organization, Admin/Agent/Customer users, Customers,
Reinsurance Treaties, Bound Policies, and Claims with Supporting Docs & Audit Logs.
"""

from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import Organization, User
from customers.models import Customer
from reinsurance.models import ReinsuranceTreaty
from policies.models import Policy
from claims.models import Claim, SupportingDocument, ClaimActivityLog


class Command(BaseCommand):
    help = 'Seeds PostgreSQL with enterprise insurance & reinsurance data for InsureSphere AI.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write('Seeding InsureSphere AI PostgreSQL database...')

        org, _ = Organization.objects.get_or_create(
            slug='insuresphere-global-syndicate',
            defaults={
                'name': 'InsureSphere Global Syndicate',
                'naic_company_code': 'NAIC-ISGS-2026',
                'domicile_country': 'United States',
            },
        )

        # 1. Seed Users (Admin, Agent, Customer)
        admin_user, created = User.objects.get_or_create(
            email='elena.vance@insuresphere.ai',
            defaults={
                'name': 'Elena Vance',
                'role': User.Role.ADMIN,
                'title': 'Chief Underwriting Officer',
                'department': 'Executive Risk & Treaty Governance',
                'license_number': 'NY-CUO-994812',
                'organization': org,
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if created:
            admin_user.set_password('InsureSphere2026!')
            admin_user.save()

        agent_user, created = User.objects.get_or_create(
            email='m.sterling@insuresphere.ai',
            defaults={
                'name': 'Marcus Sterling',
                'role': User.Role.AGENT,
                'title': 'Senior Claims & Policy Specialist',
                'department': 'Commercial Lines & Claims Triage',
                'license_number': 'IL-ADJ-442109',
                'organization': org,
            },
        )
        if created:
            agent_user.set_password('InsureSphere2026!')
            agent_user.save()

        customer_user, created = User.objects.get_or_create(
            email='afinch@meridianlogistics.com',
            defaults={
                'name': 'Alistair Finch',
                'role': User.Role.CUSTOMER,
                'title': 'VP of Global Risk, Meridian Logistics Corp',
                'department': 'Policyholder Portal',
                'license_number': 'CORP-CLIENT-882',
                'organization': org,
            },
        )
        if created:
            customer_user.set_password('InsureSphere2026!')
            customer_user.save()

        # 2. Seed Customers
        cust1, _ = Customer.objects.update_or_create(
            customer_code='CUST-1001',
            defaults={
                'organization': org,
                'created_by': admin_user,
                'name': 'Meridian Global Logistics Corp',
                'contact_person': 'Alistair Finch',
                'email': 'afinch@meridianlogistics.com',
                'phone': '+1 (312) 555-0194',
                'account_type': 'Corporate',
                'industry': 'Maritime & Supply Chain',
                'risk_tier': 'Moderate Risk',
                'risk_score': 42,
                'city': 'Chicago, IL',
                'annual_revenue': '$420,000,000',
            },
        )

        cust2, _ = Customer.objects.update_or_create(
            customer_code='CUST-1002',
            defaults={
                'organization': org,
                'created_by': admin_user,
                'name': 'Aegis BioPharma Laboratories',
                'contact_person': 'Dr. Priya Nair',
                'email': 'pnair@aegisbiopharma.io',
                'phone': '+1 (617) 555-0148',
                'account_type': 'Corporate',
                'industry': 'Biotechnology & Clinical Trials',
                'risk_tier': 'High Exposure',
                'risk_score': 74,
                'city': 'Cambridge, MA',
                'annual_revenue': '$185,000,000',
            },
        )

        # 3. Seed Reinsurance Treaties
        treaty1, _ = ReinsuranceTreaty.objects.update_or_create(
            treaty_code='TRT-2026-01',
            defaults={
                'organization': org,
                'name': '2026 Commercial Property & Cyber Quota Share Treaty',
                'treaty_type': 'Proportional Quota Share',
                'reinsurer_name': 'Swiss Re Corporate Solutions (Zurich)',
                'sp_rating': 'AA-',
                'cedant_retention_pct': 60,
                'ceded_share_pct': 40,
                'treaty_limit': 30000000,
                'attachment_point': 0,
                'ceded_premium_ytd': 942000,
                'recoveries_collected_ytd': 418500,
                'effective_date': date(2026, 1, 1),
                'expiration_date': date(2026, 12, 31),
            },
        )

        # 4. Seed Policies
        pol1, _ = Policy.objects.update_or_create(
            policy_number='POL-COM-9012',
            defaults={
                'organization': org,
                'customer': cust1,
                'underwriter': admin_user,
                'reinsurance_treaty': treaty1,
                'title': 'All-Risk Commercial Property & Business Interruption',
                'line_of_business': 'Commercial Property',
                'coverage_limit': 15000000,
                'deductible': 50000,
                'annual_premium': 275000,
                'payment_frequency': 'Quarterly',
                'effective_date': date(2026, 1, 1),
                'expiration_date': date(2026, 12, 31),
                'ceded_percentage': 40,
                'coverage_summary': (
                    'Covers direct physical loss to 14 bonded distribution warehouses across '
                    'North America, including 72-hour waiting period business interruption.'
                ),
            },
        )

        # 5. Seed Claims
        claim1, claim_created = Claim.objects.update_or_create(
            claim_number='CLM-2026-8841',
            defaults={
                'organization': org,
                'policy': pol1,
                'assigned_adjuster': agent_user,
                'incident_date': date(2026, 10, 19),
                'gross_amount': 240000,
                'deductible': 50000,
                'reinsurance_recovery': 76000,
                'status': 'Pending Review',
                'priority': 'High',
                'description': (
                    'Roof membrane uplift and automated conveyor water damage at Joliet '
                    'Distribution Hub (#WH-04) following severe windstorm.'
                ),
            },
        )
        if claim_created:
            SupportingDocument.objects.create(
                claim=claim1,
                name='Joliet_Forensic_Roof_Survey_Oct2026.pdf',
                size='2.4 MB',
            )
            ClaimActivityLog.objects.create(
                claim=claim1,
                actor='Alistair Finch (Policyholder)',
                action='First Notice of Loss (FNOL) submitted via Customer Portal.',
            )

        self.stdout.write(
            self.style.SUCCESS(
                'Successfully seeded InsureSphere AI PostgreSQL database! '
                'Default logins: elena.vance@insuresphere.ai / InsureSphere2026!'
            )
        )
