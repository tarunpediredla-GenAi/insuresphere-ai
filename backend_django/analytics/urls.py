"""URL routing for analytics app (/api/dashboard/)."""

from django.urls import path
from .views import DashboardAnalyticsAPIView

urlpatterns = [
    path('analytics/', DashboardAnalyticsAPIView.as_view(), name='dashboard-analytics'),
]
