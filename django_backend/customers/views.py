"""
CustomerViewSet implementing full CRUD, Search, Filtering, and Organization Isolation.
"""

from django.db.models import Count, Sum, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import Organization
from accounts.permissions import IsOrganizationMember, IsAdminOrAgentRole
from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    """
    REST API ViewSet for /api/customers/
    - GET    /api/customers/
    - POST   /api/customers/
    - GET    /api/customers/{customer_code}/
    - PATCH  /api/customers/{customer_code}/
    - DELETE /api/customers/{customer_code}/
    - POST   /api/customers/{customer_code}/toggle-status/
    """
    serializer_class = CustomerSerializer
    permission_classes = (IsOrganizationMember, IsAdminOrAgentRole)
    lookup_field = 'customer_code'
    filterset_fields = ('account_type', 'risk_tier', 'status')
    search_fields = ('customer_code', 'name', 'contact_person', 'email', 'industry', 'city')
    ordering_fields = ('name', 'risk_score', 'joined_date')

    def get_queryset(self):
        queryset = Customer.objects.annotate(
            annotated_policy_count=Count(
                'policies',
                filter=~Q(policies__renewal_status='Expired'),
                distinct=True,
            ),
            annotated_total_premium=Sum('policies__annual_premium'),
        )
        user = self.request.user
        if user.is_authenticated:
            if user.organization_id:
                queryset = queryset.filter(organization_id=user.organization_id)
            else:
                queryset = queryset.none()
        if user.is_authenticated and user.role == 'Customer':
            queryset = queryset.filter(email__iexact=user.email)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        org = user.organization
        if not org:
            org, _ = Organization.objects.get_or_create(
                slug='insuresphere-global-syndicate',
                defaults={
                    'name': 'InsureSphere Global Syndicate',
                    'naic_company_code': 'NAIC-ISGS-2026',
                },
            )
            user.organization = org
            user.save(update_fields=['organization'])
        next_num = 1001 + Customer.objects.count()
        customer_code = f"CUST-{next_num}"
        while Customer.objects.filter(customer_code=customer_code).exists():
            next_num += 1
            customer_code = f"CUST-{next_num}"

        serializer.save(
            customer_code=customer_code,
            organization=org,
            created_by=user,
        )

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, customer_code=None):
        customer = self.get_object()
        customer.status = (
            Customer.Status.INACTIVE
            if customer.status == Customer.Status.ACTIVE
            else Customer.Status.ACTIVE
        )
        customer.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(customer).data, status=status.HTTP_200_OK)
