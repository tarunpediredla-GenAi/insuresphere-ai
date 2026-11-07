"""URL routing for accounts app (/api/auth/)."""

from django.urls import path
from .views import (
    InsureSphereLoginView,
    UserRegistrationAPIView,
    UserProfileAPIView,
    InsureSphereTokenRefreshView,
    InsureSphereLogoutView,
)

urlpatterns = [
    path('login/', InsureSphereLoginView.as_view(), name='auth-login'),
    path('register/', UserRegistrationAPIView.as_view(), name='auth-register'),
    path('token/refresh/', InsureSphereTokenRefreshView.as_view(), name='auth-token-refresh'),
    path('logout/', InsureSphereLogoutView.as_view(), name='auth-logout'),
    path('me/', UserProfileAPIView.as_view(), name='auth-me'),
]
