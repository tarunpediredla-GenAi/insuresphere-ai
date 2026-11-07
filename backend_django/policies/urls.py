"""URL routing for policies app (/api/policies/)."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PolicyViewSet

router = DefaultRouter()
router.register(r'', PolicyViewSet, basename='policy')

urlpatterns = [
    path('', include(router.urls)),
]
