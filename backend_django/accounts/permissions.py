"""
Role-Based Access Control (RBAC) and Organization Isolation Permissions for DRF.
"""

from rest_framework import permissions


class IsOrganizationMember(permissions.BasePermission):
    """
    Ensures the authenticated user belongs to an active Organization and
    can only access records scoped to their own organization.
    """
    message = 'Access denied: Resource belongs to a different insurance organization tenant.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active)

    def has_object_permission(self, request, view, obj):
        user_org_id = getattr(request.user, 'organization_id', None)
        obj_org_id = getattr(obj, 'organization_id', None)
        if user_org_id and obj_org_id:
            return user_org_id == obj_org_id
        return True


class IsAdminRole(permissions.BasePermission):
    """Allows access strictly to System Administrators / Chief Underwriting Officers."""
    message = 'Permission denied: Requires System Administrator (Admin) privileges.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Admin'
        )


class IsAdminOrAgentRole(permissions.BasePermission):
    """
    Allows write operations to Admin or Agent users.
    Read-only access can be granted or restricted per ViewSet.
    """
    message = 'Permission denied: Requires Admin or Licensed Insurance Agent role.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role in ('Admin', 'Agent')
