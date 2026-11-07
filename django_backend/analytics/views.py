"""
Analytics & Executive Dashboard Statistics APIView for InsureSphere AI.
Uses PostgreSQL aggregate functions (Count, Sum, Q) scoped to the user's Organization.
"""

from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim
from reinsurance.models import ReinsuranceTreaty


class DashboardAnalyticsAPIView(APIView):
    """GET /api/dashboard/analytics/ — Returns portfolio KPIs and line-of-business breakdown."""
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        org_filter = {}
        if request.user.organization_id:
            org_filter = {'organization_id': request.user.organization_id}

        customers_qs = Customer.objects.filter(**org_filter)
        policies_qs = Policy.objects.filter(**org_filter)
        claims_qs = Claim.objects.filter(**org_filter)
        treaties_qs = ReinsuranceTreaty.objects.filter(**org_filter)

        total_customers = customers_qs.count()
        active_customers = customers_qs.filter(status='Active').count()
        active_policies = policies_qs.exclude(renewal_status='Expired').count()

        claims_agg = claims_qs.aggregate(
            total_claims=Count('id'),
            pending_claims=Count('id', filter=Q(status__in=['Pending Review', 'SIU Investigation'])),
            approved_claims=Count('id', filter=Q(status='Approved')),
            rejected_claims=Count('id', filter=Q(status='Rejected')),
            total_claims_volume=Sum('gross_amount'),
            total_reinsurance_recoveries=Sum('reinsurance_recovery', filter=Q(status='Approved')),
        )

        premium_agg = policies_qs.aggregate(total_premium_revenue=Sum('annual_premium'))
        lob_breakdown = list(
            policies_qs.values('line_of_business').annotate(
                policies=Count('id'),
                premium=Sum('annual_premium'),
            )
        )

        return Response(
            {
                'totalCustomers': total_customers,
                'activeCustomers': active_customers,
                'activePolicies': active_policies,
                'totalClaims': claims_agg['total_claims'] or 0,
                'pendingClaims': claims_agg['pending_claims'] or 0,
                'approvedClaims': claims_agg['approved_claims'] or 0,
                'rejectedClaims': claims_agg['rejected_claims'] or 0,
                'totalPremiumRevenue': float(premium_agg['total_premium_revenue'] or 0),
                'totalClaimsVolume': float(claims_agg['total_claims_volume'] or 0),
                'totalReinsuranceRecoveries': float(claims_agg['total_reinsurance_recoveries'] or 0),
                'activeTreatiesCount': treaties_qs.count(),
                'portfolioByLob': lob_breakdown,
            }
        )
