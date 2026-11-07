"""Django Admin registration for Customer."""

from django.contrib import admin
from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        'customer_code',
        'name',
        'account_type',
        'industry',
        'risk_tier',
        'risk_score',
        'status',
        'organization',
    )
    search_fields = ('customer_code', 'name', 'contact_person', 'email', 'industry')
    list_filter = ('account_type', 'risk_tier', 'status', 'organization')
