"""Django Admin registrations for Organization and custom User."""

from django.contrib import admin
from .models import Organization, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'naic_company_code', 'domicile_country', 'is_active', 'created_at')
    search_fields = ('name', 'naic_company_code')
    list_filter = ('is_active', 'domicile_country')


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'role', 'organization', 'is_active', 'created_at')
    search_fields = ('email', 'name', 'license_number')
    list_filter = ('role', 'is_active', 'organization')
