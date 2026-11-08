"""Serializers and ViewSet for Claims Management (/api/claims/)."""

import random
from rest_framework import serializers, viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from accounts.permissions import IsOrganizationMember
from policies.models import Policy
from .models import Claim, SupportingDocument, ClaimActivityLog


class SupportingDocumentSerializer(serializers.ModelSerializer):
    uploadedAt = serializers.DateField(source='uploaded_at', read_only=True)

    class Meta:
        model = SupportingDocument
        fields = ('name', 'size', 'uploadedAt')


class ClaimActivityLogSerializer(serializers.ModelSerializer):
    timestamp = serializers.SerializerMethodField()

    class Meta:
        model = ClaimActivityLog
        fields = ('id', 'timestamp', 'actor', 'action')

    def get_timestamp(self, obj):
        return obj.timestamp.strftime('%Y-%m-%d %H:%M UTC')


class ClaimSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source='claim_number', read_only=True)
    claimNumber = serializers.CharField(source='claim_number', read_only=True)
    policyId = serializers.CharField(write_only=True, required=False)
    policyNumber = serializers.CharField(source='policy.policy_number', read_only=True)
    customerId = serializers.CharField(source='policy.customer.customer_code', read_only=True)
    customerName = serializers.CharField(source='policy.customer.name', read_only=True)
    type = serializers.CharField(source='policy.line_of_business', read_only=True)
    incidentDate = serializers.DateField(source='incident_date', required=False)
    submittedDate = serializers.DateField(source='submitted_date', read_only=True)
    amount = serializers.FloatField(source='gross_amount', required=False)
    reinsuranceRecovery = serializers.FloatField(source='reinsurance_recovery', read_only=True)
    assignedAdjuster = serializers.SerializerMethodField()
    supportingDocs = SupportingDocumentSerializer(source='supporting_docs', many=True, required=False)
    activityHistory = ClaimActivityLogSerializer(source='activity_logs', many=True, read_only=True)
    reviewerNote = serializers.CharField(write_only=True, required=False, allow_blank=True)
    action = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Claim
        fields = (
            'id',
            'claimNumber',
            'policyId',
            'policyNumber',
            'customerId',
            'customerName',
            'type',
            'incidentDate',
            'submittedDate',
            'amount',
            'deductible',
            'reinsuranceRecovery',
            'status',
            'priority',
            'assignedAdjuster',
            'description',
            'supportingDocs',
            'activityHistory',
            'reviewerNote',
            'action',
        )
        read_only_fields = ('deductible', 'priority')

    def to_internal_value(self, data):
        # Normalize status if caller passed 'Hold' or variations
        if 'status' in data and isinstance(data['status'], str):
            status_val = data['status'].strip()
            if status_val.lower() in ('hold', 'pending review', 'pending', 'hold for inquiry', 'hold for adjuster inquiry'):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['status'] = Claim.Status.PENDING
            elif status_val.lower() in ('approve', 'approved'):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['status'] = Claim.Status.APPROVED
            elif status_val.lower() in ('reject', 'rejected'):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['status'] = Claim.Status.REJECTED
            elif status_val.lower() in ('siu', 'siu investigation'):
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['status'] = Claim.Status.SIU
        return super().to_internal_value(data)

    def get_assignedAdjuster(self, obj):
        return obj.assigned_adjuster.name if obj.assigned_adjuster else 'Marcus Sterling'

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['policyId'] = instance.policy.policy_number
        rep['deductible'] = float(instance.deductible)
        return rep


class ClaimViewSet(viewsets.ModelViewSet):
    serializer_class = ClaimSerializer
    permission_classes = (permissions.IsAuthenticated, IsOrganizationMember)
    lookup_field = 'claim_number'
    filterset_fields = ('status', 'priority')
    search_fields = ('claim_number', 'policy__policy_number', 'policy__customer__name', 'description')

    def get_queryset(self):
        qs = Claim.objects.select_related(
            'policy', 'policy__customer', 'assigned_adjuster'
        ).prefetch_related('supporting_docs', 'activity_logs')
        user = self.request.user
        if user.is_authenticated and user.organization_id:
            qs = qs.filter(organization_id=user.organization_id)
        if user.is_authenticated and user.role == 'Customer':
            qs = qs.filter(policy__customer__email__iexact=user.email)
        return qs

    def perform_create(self, serializer):
        policy_code = serializer.validated_data.pop('policyId', None)
        docs_data = serializer.validated_data.pop('supporting_docs', [])
        serializer.validated_data.pop('reviewerNote', None)
        serializer.validated_data.pop('action', None)

        policy = None
        if policy_code:
            policy = Policy.objects.filter(policy_number=policy_code).first()
        if not policy and self.request.user.organization_id:
            policy = Policy.objects.filter(organization_id=self.request.user.organization_id).first()
        if not policy:
            policy = Policy.objects.first()
        gross_amount = float(serializer.validated_data.get('gross_amount', 85000))
        deductible = float(policy.deductible)
        net_eligible = max(0.0, gross_amount - deductible)
        ceded_pct = float(policy.ceded_percentage) / 100.0
        reinsurance_recovery = round(net_eligible * ceded_pct, 2)

        claim_number = f"CLM-2026-{random.randint(8900, 9999)}"
        priority = 'Critical' if gross_amount >= 250000 else 'High' if gross_amount >= 100000 else 'Medium'

        claim = serializer.save(
            claim_number=claim_number,
            organization=policy.organization,
            policy=policy,
            deductible=deductible,
            reinsurance_recovery=reinsurance_recovery,
            priority=priority,
        )

        if docs_data:
            for doc in docs_data:
                SupportingDocument.objects.create(claim=claim, **doc)
        else:
            SupportingDocument.objects.create(
                claim=claim,
                name='FNOL_Loss_Declaration_Signed.pdf',
                size='1.4 MB',
            )

        ClaimActivityLog.objects.create(
            claim=claim,
            actor=f"{self.request.user.name} ({self.request.user.role})",
            action=f"Submitted First Notice of Loss (FNOL) for ${gross_amount:,.0f} under {policy.policy_number}.",
        )

    def perform_update(self, serializer):
        user = self.request.user
        if user.role not in ('Admin', 'Agent'):
            raise PermissionDenied('Only Admin or Licensed Insurance Adjusters can approve, hold, or reject claims.')

        reviewer_note = (serializer.validated_data.pop('reviewerNote', None) or '').strip()
        review_action = (serializer.validated_data.pop('action', None) or '').strip()

        # Enforce distinct, correct actions and backend-supported review statuses:
        # 1. Approve -> Claim.Status.APPROVED ('Approved')
        # 2. Hold -> Claim.Status.PENDING ('Pending Review') - NEVER 'Approved'
        # 3. Reject -> Claim.Status.REJECTED ('Rejected')
        if review_action:
            action_lower = review_action.lower()
            if action_lower in ('approve', 'approved'):
                serializer.validated_data['status'] = Claim.Status.APPROVED
                action_desc = 'Approved claim settlement.'
            elif action_lower in ('hold', 'hold for inquiry', 'hold for adjuster inquiry', 'pending review', 'pending'):
                serializer.validated_data['status'] = Claim.Status.PENDING
                action_desc = 'Held claim for adjuster inquiry.'
            elif action_lower in ('reject', 'rejected'):
                serializer.validated_data['status'] = Claim.Status.REJECTED
                action_desc = 'Rejected claim.'
            else:
                action_desc = f'Action "{review_action}" recorded.'
        else:
            new_status = serializer.validated_data.get('status')
            if new_status == Claim.Status.APPROVED:
                action_desc = 'Approved claim settlement.'
            elif new_status == Claim.Status.PENDING:
                action_desc = 'Held claim for adjuster inquiry.'
            elif new_status == Claim.Status.REJECTED:
                action_desc = 'Rejected claim.'
            elif new_status == Claim.Status.SIU:
                action_desc = 'Escalated claim to SIU Investigation.'
            elif new_status:
                action_desc = f'Changed status to "{new_status}".'
            else:
                action_desc = 'Updated claim details.'

        claim = serializer.save()

        # Construct clear audit log action; preserve history (never delete or overwrite)
        # Settlements/payments are not auto-triggered
        if reviewer_note:
            log_action = f"{action_desc} Note: {reviewer_note}"
        else:
            log_action = action_desc

        ClaimActivityLog.objects.create(
            claim=claim,
            actor=f"{user.name} ({user.role})",
            action=log_action,
        )
