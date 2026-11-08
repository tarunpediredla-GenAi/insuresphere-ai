"""
Analytics & Executive Dashboard Statistics APIView for InsureSphere AI.
Uses PostgreSQL aggregate functions (Count, Sum, Q) scoped to the user's Organization.
"""

from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from customers.models import Customer
from policies.models import Policy
from claims.models import Claim
from reinsurance.models import ReinsuranceTreaty


class DashboardAnalyticsAPIView(APIView):
    """GET /api/dashboard/analytics/ — Returns portfolio KPIs and line-of-business breakdown."""
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not (request.user and request.user.is_authenticated):
            return Response({'detail': 'Authentication credentials were not provided.'}, status=401)

        # RBAC Check: Ensure confidential financial portfolio metrics are not exposed to Customer role
        if request.user.role not in ('Admin', 'Agent'):
            raise PermissionDenied('Access denied: Executive portfolio analytics is restricted to licensed agents and administrators.')

        if not request.user.organization_id:
            return Response(
                {
                    'totalCustomers': 0,
                    'activeCustomers': 0,
                    'totalPolicies': 0,
                    'activePolicies': 0,
                    'totalClaims': 0,
                    'pendingClaims': 0,
                    'approvedClaims': 0,
                    'rejectedClaims': 0,
                    'totalPremiumRevenue': 0.0,
                    'totalClaimsVolume': 0.0,
                    'totalReinsuranceRecoveries': 0.0,
                    'lossRatio': 0.0,
                    'activeTreatiesCount': 0,
                    'portfolioByLob': [],
                },
                status=200,
            )

        org_filter = {'organization_id': request.user.organization_id}

        customers_qs = Customer.objects.filter(**org_filter)
        policies_qs = Policy.objects.filter(**org_filter)
        claims_qs = Claim.objects.filter(**org_filter)
        treaties_qs = ReinsuranceTreaty.objects.filter(**org_filter)

        # Optional date range filtering on effective_date / incident_date
        start_date = request.query_params.get('start_date') or request.query_params.get('from')
        end_date = request.query_params.get('end_date') or request.query_params.get('to')

        if start_date:
            try:
                policies_qs = policies_qs.filter(effective_date__gte=start_date)
                claims_qs = claims_qs.filter(incident_date__gte=start_date)
            except Exception:
                pass

        if end_date:
            try:
                policies_qs = policies_qs.filter(effective_date__lte=end_date)
                claims_qs = claims_qs.filter(incident_date__lte=end_date)
            except Exception:
                pass

        total_customers = customers_qs.count()
        active_customers = customers_qs.filter(status='Active').count()
        total_policies = policies_qs.count()
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
        total_premium = float(premium_agg['total_premium_revenue'] or 0)
        total_claims_vol = float(claims_agg['total_claims_volume'] or 0)
        # Actuarial Loss Ratio = (Incurred Claims / Earned Premium) * 100 with zero division protection
        loss_ratio = round((total_claims_vol / total_premium) * 100, 2) if total_premium > 0 else 0.0

        lob_items = list(
            policies_qs.values('line_of_business').annotate(
                policies=Count('id'),
                premium=Sum('annual_premium'),
            )
        )
        lob_breakdown = []
        for item in lob_items:
            lob_name = item['line_of_business']
            lob_claims = claims_qs.filter(policy__line_of_business=lob_name).aggregate(claims_vol=Sum('gross_amount'))['claims_vol'] or 0
            lob_prem = float(item['premium'] or 0)
            lob_lr = round((float(lob_claims) / lob_prem) * 100, 2) if lob_prem > 0 else 0.0
            lob_breakdown.append({
                'line_of_business': lob_name,
                'policies': item['policies'],
                'premium': lob_prem,
                'claims': float(lob_claims),
                'lossRatio': lob_lr,
            })

        return Response(
            {
                'totalCustomers': total_customers,
                'activeCustomers': active_customers,
                'totalPolicies': total_policies,
                'activePolicies': active_policies,
                'totalClaims': claims_agg['total_claims'] or 0,
                'pendingClaims': claims_agg['pending_claims'] or 0,
                'approvedClaims': claims_agg['approved_claims'] or 0,
                'rejectedClaims': claims_agg['rejected_claims'] or 0,
                'totalPremiumRevenue': total_premium,
                'totalClaimsVolume': total_claims_vol,
                'totalReinsuranceRecoveries': float(claims_agg['total_reinsurance_recoveries'] or 0),
                'lossRatio': loss_ratio,
                'activeTreatiesCount': treaties_qs.filter(status='Active').count() if treaties_qs.filter(status='Active').exists() else treaties_qs.count(),
                'portfolioByLob': lob_breakdown,
            }
        )
