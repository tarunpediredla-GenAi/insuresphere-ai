"""Serializers and ViewSet for Insurance Policies (/api/policies/)."""

import random
from rest_framework import serializers, viewsets
from accounts.models import Organization
from accounts.permissions import IsOrganizationMember, IsAdminOrAgentRole
from customers.models import Customer
from reinsurance.models import ReinsuranceTreaty
from .models import Policy


class PolicySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='policy_number', read_only=True)
    policyNumber = serializers.CharField(source='policy_number', read_only=True)
    customerId = serializers.CharField(write_only=True)
    customerName = serializers.CharField(source='customer.name', read_only=True)
    lineOfBusiness = serializers.ChoiceField(source='line_of_business', choices=Policy.LineOfBusiness.choices)
    coverageLimit = serializers.FloatField(source='coverage_limit')
    annualPremium = serializers.FloatField(source='annual_premium')
    paymentFrequency = serializers.CharField(source='payment_frequency', default='Annual')
    effectiveDate = serializers.DateField(source='effective_date')
    expirationDate = serializers.DateField(source='expiration_date')
    renewalStatus = serializers.CharField(source='renewal_status', required=False, default='Active')
    underwriter = serializers.SerializerMethodField()
    reinsuranceTreatyId = serializers.CharField(write_only=True, required=False, allow_blank=True)
    cededPercentage = serializers.FloatField(source='ceded_percentage', read_only=True)
    coverageSummary = serializers.CharField(source='coverage_summary')

    class Meta:
        model = Policy
        fields = (
            'id',
            'policyNumber',
            'title',
            'customerId',
            'customerName',
            'lineOfBusiness',
            'coverageLimit',
            'deductible',
            'annualPremium',
            'paymentFrequency',
            'effectiveDate',
            'expirationDate',
            'renewalStatus',
            'underwriter',
            'reinsuranceTreatyId',
            'cededPercentage',
            'coverageSummary',
            'exclusions',
        )

    def get_underwriter(self, obj):
        return obj.underwriter.name if obj.underwriter else 'Elena Vance'

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['customerId'] = instance.customer.customer_code
        rep['reinsuranceTreatyId'] = (
            instance.reinsurance_treaty.treaty_code if instance.reinsurance_treaty else 'TRT-2026-01'
        )
        rep['deductible'] = float(instance.deductible)
        return rep


class PolicyViewSet(viewsets.ModelViewSet):
    serializer_class = PolicySerializer
    permission_classes = (IsOrganizationMember, IsAdminOrAgentRole)
    lookup_field = 'policy_number'
    filterset_fields = ('line_of_business', 'renewal_status')
    search_fields = ('policy_number', 'title', 'customer__name', 'customer__customer_code')

    def get_queryset(self):
        qs = Policy.objects.select_related('customer', 'underwriter', 'reinsurance_treaty')
        user = self.request.user
        if user.is_authenticated and user.organization_id:
            qs = qs.filter(organization_id=user.organization_id)
        if user.is_authenticated and user.role == 'Customer':
            qs = qs.filter(customer__email__iexact=user.email)
        return qs

    def perform_create(self, serializer):
        customer_code = serializer.validated_data.pop('customerId')
        treaty_code = serializer.validated_data.pop('reinsuranceTreatyId', None)

        customer = Customer.objects.get(customer_code=customer_code)
        treaty = (
            ReinsuranceTreaty.objects.filter(treaty_code=treaty_code).first()
            if treaty_code
            else ReinsuranceTreaty.objects.first()
        )

        lob = serializer.validated_data.get('line_of_business', 'Commercial Property')
        prefix = 'CYB' if 'Cyber' in lob else 'MAR' if 'Marine' in lob else 'ENG' if 'Energy' in lob else 'COM'
        policy_number = f"POL-{prefix}-{random.randint(9300, 9999)}"

        serializer.save(
            policy_number=policy_number,
            organization=customer.organization,
            customer=customer,
            underwriter=self.request.user,
            reinsurance_treaty=treaty,
            ceded_percentage=treaty.ceded_share_pct if treaty else 40.0,
        )
