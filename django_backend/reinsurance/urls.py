"""URL routing for reinsurance app (/api/reinsurance/)."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReinsuranceTreatyViewSet

router = DefaultRouter()
router.register(r'treaties', ReinsuranceTreatyViewSet, basename='reinsurance-treaty')
router.register(r'', ReinsuranceTreatyViewSet, basename='reinsurance-root')

urlpatterns = [
    path('', include(router.urls)),
]
