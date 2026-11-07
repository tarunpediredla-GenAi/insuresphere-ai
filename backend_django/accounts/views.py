"""
Authentication & User Profile API Views for InsureSphere AI.
"""

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import (
    InsureSphereTokenObtainPairSerializer,
    UserRegistrationSerializer,
    UserProfileSerializer,
)


class InsureSphereLoginView(TokenObtainPairView):
    """POST /api/auth/login/ — Issues access + refresh JWT tokens with RBAC claims."""
    permission_classes = (permissions.AllowAny,)
    serializer_class = InsureSphereTokenObtainPairSerializer


class UserRegistrationAPIView(generics.CreateAPIView):
    """POST /api/auth/register/ — Registers a new Customer, Agent, or Admin account."""
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token_Pair = InsureSphereTokenObtainPairSerializer.get_token(user)
        return Response(
            {
                'access': str(token_Pair.access_token),
                'refresh': str(token_Pair),
                'user': UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class UserProfileAPIView(generics.RetrieveUpdateAPIView):
    """GET / PATCH /api/auth/me/ — Retrieves or updates the authenticated user's profile."""
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user
