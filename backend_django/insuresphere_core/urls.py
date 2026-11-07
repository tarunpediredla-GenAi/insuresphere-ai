"""
Root URL Routing for InsureSphere AI Django REST Backend.
Mounts all 7 domain apps under /api/.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/policies/', include('policies.urls')),
    path('api/claims/', include('claims.urls')),
    path('api/reinsurance/', include('reinsurance.urls')),
    path('api/dashboard/', include('analytics.urls')),
    path('api/ai/', include('ai_assistant.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
