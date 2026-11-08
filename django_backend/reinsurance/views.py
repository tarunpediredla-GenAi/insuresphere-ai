"""Serializers & ViewSets for Reinsurance Treaties (/api/reinsurance/)."""

from rest_framework import serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from accounts.models import Organization
from accounts.permissions import IsOrganizationMember, IsAdminOrAgentRole
from .models import ReinsuranceTreaty


class ReinsuranceTreatySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='treaty_code', read_only=True)
    treatyCode = serializers.CharField(source='treaty_code', read_only=True)
    type = serializers.ChoiceField(source='treaty_type', choices=ReinsuranceTreaty.TreatyType.choices)
    reinsurerName = serializers.CharField(source='reinsurer_name')
    spRating = serializers.CharField(source='sp_rating', default='AA-')
    cedantRetentionPct = serializers.FloatField(source='cedant_retention_pct', read_only=True)
    cededSharePct = serializers.FloatField(source='ceded_share_pct')
    treatyLimit = serializers.FloatField(source='treaty_limit')
    attachmentPoint = serializers.FloatField(source='attachment_point', default=0)
    cededPremiumYTD = serializers.FloatField(source='ceded_premium_ytd', default=0)
    recoveriesCollectedYTD = serializers.FloatField(source='recoveries_collected_ytd', read_only=True)
    pendingRecoveries = serializers.FloatField(source='pending_recoveries', read_only=True)
    effectiveDate = serializers.DateField(source='effective_date')
    expirationDate = serializers.DateField(source='expiration_date')

    class Meta:
        model = ReinsuranceTreaty
        fields = (
            'id',
            'treatyCode',
            'name',
            'type',
            'reinsurerName',
            'spRating',
            'cedantRetentionPct',
            'cededSharePct',
            'treatyLimit',
            'attachmentPoint',
            'cededPremiumYTD',
            'recoveriesCollectedYTD',
            'pendingRecoveries',
            'effectiveDate',
            'expirationDate',
            'status',
        )

    def validate(self, attrs):
        ceded = float(attrs.get('ceded_share_pct', 40))
        if not (5 <= ceded <= 95):
            raise serializers.ValidationError({'cededSharePct': 'Ceded share must be between 5% and 95%.'})
        attrs['cedant_retention_pct'] = round(100.0 - ceded, 2)
        return attrs


class ReinsuranceTreatyViewSet(viewsets.ModelViewSet):
    serializer_class = ReinsuranceTreatySerializer
    permission_classes = (IsOrganizationMember, IsAdminOrAgentRole)
    lookup_field = 'treaty_code'

    def get_queryset(self):
        user = self.request.user
        if not (user and user.is_authenticated and user.organization_id):
            return ReinsuranceTreaty.objects.none()
        return ReinsuranceTreaty.objects.filter(organization_id=user.organization_id)

    def perform_create(self, serializer):
        user = self.request.user
        if not (user and user.is_authenticated and user.organization):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an active organization.')

        idx = ReinsuranceTreaty.objects.count() + 1
        while ReinsuranceTreaty.objects.filter(treaty_code=f"TRT-2026-{idx:02d}").exists():
            idx += 1
        treaty_code = f"TRT-2026-{idx:02d}"
        serializer.save(treaty_code=treaty_code, organization=user.organization)

    @action(detail=True, methods=['post'], url_path='calculate-cession')
    def calculate_cession(self, request, treaty_code=None):
        treaty = self.get_object()
        gross_loss = float(request.data.get('grossLoss', 250000))
        deductible = float(request.data.get('deductible', 25000))
        return Response(treaty.calculate_recovery(gross_loss, deductible), status=status.HTTP_200_OK)
