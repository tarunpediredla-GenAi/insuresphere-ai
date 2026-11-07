"""
DRF Serializers for Customer CRUD Operations.
Maps snake_case PostgreSQL columns cleanly to camelCase frontend properties.
"""

from django.db.models import Sum
from rest_framework import serializers
from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='customer_code', read_only=True)
    contactPerson = serializers.CharField(source='contact_person')
    accountType = serializers.ChoiceField(source='account_type', choices=Customer.AccountType.choices)
    riskTier = serializers.ChoiceField(source='risk_tier', choices=Customer.RiskTier.choices)
    riskScore = serializers.IntegerField(source='risk_score', min_value=1, max_value=100)
    kycStatus = serializers.CharField(source='kyc_status', required=False, default='Verified')
    annualRevenue = serializers.CharField(source='annual_revenue', required=False, default='$50,000,000')
    joinedDate = serializers.DateField(source='joined_date', read_only=True)
    activePoliciesCount = serializers.SerializerMethodField()
    totalPremium = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            'id',
            'name',
            'contactPerson',
            'email',
            'phone',
            'accountType',
            'industry',
            'riskTier',
            'riskScore',
            'kycStatus',
            'status',
            'city',
            'annualRevenue',
            'activePoliciesCount',
            'totalPremium',
            'joinedDate',
        )

    def get_activePoliciesCount(self, obj):
        if hasattr(obj, 'annotated_policy_count'):
            return obj.annotated_policy_count or 0
        return obj.policies.exclude(renewal_status='Expired').count()

    def get_totalPremium(self, obj):
        if hasattr(obj, 'annotated_total_premium'):
            return float(obj.annotated_total_premium or 0)
        agg = obj.policies.aggregate(total=Sum('annual_premium'))
        return float(agg['total'] or 0)

    def validate_riskScore(self, value):
        if not (1 <= value <= 100):
            raise serializers.ValidationError('Actuarial risk score must be between 1 and 100.')
        return value
