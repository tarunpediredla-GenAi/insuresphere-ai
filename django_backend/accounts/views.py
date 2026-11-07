"""
Authentication & User Profile API Views for InsureSphere AI.
"""

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (
    InsureSphereTokenObtainPairSerializer,
    UserRegistrationSerializer,
    UserProfileSerializer,
)

REFRESH_COOKIE_NAME = 'insuresphere_refresh_token'
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def set_refresh_cookie(response, refresh_token):
    """
    Sets a secure HttpOnly cookie for the refresh token.
    Prevents storage of long-lived refresh tokens in localStorage.
    """
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        samesite='Lax',
        secure=False,  # Set to True in production HTTPS environments
        path='/',
    )


def clear_refresh_cookie(response):
    """Clears the HttpOnly refresh token cookie on logout."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path='/')


class InsureSphereLoginView(TokenObtainPairView):
    """POST /api/auth/login/ — Issues access + refresh JWT tokens with RBAC claims and HttpOnly cookie."""
    permission_classes = (permissions.AllowAny,)
    serializer_class = InsureSphereTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK and 'refresh' in response.data:
            set_refresh_cookie(response, response.data['refresh'])
        return response


class UserRegistrationAPIView(generics.CreateAPIView):
    """POST /api/auth/register/ — Registers a new Customer, Agent, or Admin account."""
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token_Pair = InsureSphereTokenObtainPairSerializer.get_token(user)
        refresh_str = str(token_Pair)
        response = Response(
            {
                'access': str(token_Pair.access_token),
                'refresh': refresh_str,
                'user': UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
        set_refresh_cookie(response, refresh_str)
        return response


class InsureSphereTokenRefreshView(TokenRefreshView):
    """
    POST /api/auth/token/refresh/ — Renews access token using either HttpOnly cookie or request body.
    Updates HttpOnly cookie if token rotation is active.
    """
    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if not data.get('refresh'):
            cookie_token = (
                request.COOKIES.get(REFRESH_COOKIE_NAME)
                or request.COOKIES.get('refresh_token')
                or request.COOKIES.get('refresh')
            )
            if cookie_token:
                data['refresh'] = cookie_token
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        response = Response(serializer.validated_data, status=status.HTTP_200_OK)
        new_refresh = response.data.get('refresh')
        if new_refresh:
            set_refresh_cookie(response, new_refresh)
        elif data.get('refresh'):
            set_refresh_cookie(response, data['refresh'])
        return response


class InsureSphereLogoutView(generics.GenericAPIView):
    """POST /api/auth/logout/ — Clears the HttpOnly refresh cookie and blacklists the token."""
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        refresh_token = (
            request.data.get('refresh')
            or request.COOKIES.get(REFRESH_COOKIE_NAME)
            or request.COOKIES.get('refresh_token')
        )
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass
        response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        return response


class UserProfileAPIView(generics.RetrieveUpdateAPIView):
    """GET / PATCH /api/auth/me/ — Retrieves or updates the authenticated user's profile."""
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user
