"""URL routing for accounts app (/api/auth/)."""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import InsureSphereLoginView, UserRegistrationAPIView, UserProfileAPIView

urlpatterns = [
    path('login/', InsureSphereLoginView.as_view(), name='auth-login'),
    path('register/', UserRegistrationAPIView.as_view(), name='auth-register'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('me/', UserProfileAPIView.as_view(), name='auth-me'),
]
