"""
Serializers for User Registration, Profile Management, and SimpleJWT Token Claims.
"""

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Organization


class InsureSphereTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Customizes SimpleJWT token generation to embed role, organization, and scopes
    in the signed JWT payload and return user metadata in the login response.
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['name'] = user.name
        token['role'] = user.role
        token['organization_id'] = str(user.organization_id) if user.organization_id else None
        token['scopes'] = user.role_permissions
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': str(self.user.id),
            'name': self.user.name,
            'email': self.user.email,
            'role': self.user.role,
            'title': self.user.title,
            'department': self.user.department,
            'licenseNumber': self.user.license_number,
            'organization': self.user.organization.name if self.user.organization else 'InsureSphere Carrier Syndicate',
            'permissions': self.user.role_permissions,
        }
        return data


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)
    organization_name = serializers.CharField(
        write_only=True,
        required=False,
        default='InsureSphere Global Syndicate',
    )

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'name',
            'password',
            'role',
            'title',
            'department',
            'license_number',
            'organization_name',
        )
        read_only_fields = ('id',)

    def create(self, validated_data):
        org_name = validated_data.pop('organization_name', 'InsureSphere Global Syndicate')
        password = validated_data.pop('password')

        # Privilege-escalation guard: this endpoint is AllowAny, so a
        # client-supplied role must never be honoured for anonymous callers —
        # otherwise anyone could self-register as Admin. Public registration
        # ALWAYS creates a Customer. Only an already-authenticated Admin
        # creating an account through this endpoint may set Admin/Agent.
        request = self.context.get('request') if hasattr(self, 'context') else None
        request_user = getattr(request, 'user', None)
        is_admin_creator = bool(
            request_user is not None
            and getattr(request_user, 'is_authenticated', False)
            and getattr(request_user, 'role', None) == User.Role.ADMIN
        )
        if not is_admin_creator:
            validated_data['role'] = User.Role.CUSTOMER

        organization, _ = Organization.objects.get_or_create(
            slug=org_name.lower().replace(' ', '-')[:75],
            defaults={
                'name': org_name,
                'naic_company_code': f"NAIC-{org_name[:4].upper()}-2026",
            },
        )
        user = User.objects.create_user(
            organization=organization,
            password=password,
            **validated_data,
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    permissions = serializers.ReadOnlyField(source='role_permissions')
    licenseNumber = serializers.CharField(source='license_number')

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'name',
            'role',
            'title',
            'department',
            'licenseNumber',
            'organization_name',
            'permissions',
            'created_at',
        )
        read_only_fields = ('id', 'email', 'role', 'organization_name', 'permissions', 'created_at')
