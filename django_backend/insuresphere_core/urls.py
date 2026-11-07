"""
Root URL Routing for InsureSphere AI Django REST Backend.
Mounts all 7 domain apps under /api/.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthAPIView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        return Response({'status': 'ok'})


def root_index_view(request):
    """
    User-friendly root endpoint so visiting http://127.0.0.1:8000/
    displays a useful landing page instead of a 404 error.
    """
    accept_header = request.headers.get('Accept', '')
    if 'application/json' in accept_header and 'text/html' not in accept_header:
        return JsonResponse({
            'status': 'online',
            'service': 'InsureSphere AI - Django REST API Backend',
            'version': '1.0.0',
            'frontend_url': 'http://localhost:3000',
            'admin_url': '/admin/',
            'endpoints': [
                '/api/health/',
                '/api/auth/token/',
                '/api/customers/',
                '/api/policies/',
                '/api/claims/',
                '/api/reinsurance/',
                '/api/dashboard/',
                '/api/ai/',
            ]
        })

    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InsureSphere AI - Backend API</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
        }
        .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            max-width: 680px;
            width: 100%;
            padding: 36px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #064e3b;
            color: #34d399;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        .badge-dot {
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 10px #10b981;
        }
        h1 {
            font-size: 26px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 8px;
        }
        p.subtitle {
            color: #94a3b8;
            font-size: 15px;
            margin-bottom: 28px;
            line-height: 1.5;
        }
        .section-title {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            font-weight: 700;
            margin-bottom: 12px;
        }
        .btn-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 28px;
        }
        .btn {
            display: block;
            text-align: center;
            padding: 12px 18px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: #3b82f6;
            color: #ffffff;
        }
        .btn-primary:hover {
            background: #2563eb;
        }
        .btn-secondary {
            background: #334155;
            color: #e2e8f0;
        }
        .btn-secondary:hover {
            background: #475569;
        }
        .notice {
            background: #1e1b4b;
            border-left: 4px solid #6366f1;
            padding: 14px 18px;
            border-radius: 6px;
            font-size: 14px;
            color: #c7d2fe;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .notice code {
            background: #312e81;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            color: #e0e7ff;
        }
        ul.endpoints {
            list-style: none;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        ul.endpoints li a {
            color: #38bdf8;
            text-decoration: none;
            font-family: monospace;
            font-size: 13px;
            padding: 6px 10px;
            background: #0f172a;
            border-radius: 6px;
            display: block;
            border: 1px solid #1e293b;
            transition: border-color 0.2s;
        }
        ul.endpoints li a:hover {
            border-color: #38bdf8;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">
            <span class="badge-dot"></span>
            Django REST Backend Active &amp; Operational
        </div>
        <h1>InsureSphere AI Backend API</h1>
        <p class="subtitle">The Python Django REST Framework server is running successfully on port 8000.</p>

        <div class="notice">
            &#128161; <strong>Looking for the User Interface?</strong><br>
            The React frontend runs on <code>http://localhost:3000</code>.<br>
            Open a terminal in the project root and run <code>npm run dev</code>.
        </div>

        <div class="section-title">Quick Links</div>
        <div class="btn-grid">
            <a href="http://localhost:3000" target="_blank" class="btn btn-primary">Open Frontend (Port 3000)</a>
            <a href="/admin/" class="btn btn-secondary">Django Admin Panel</a>
            <a href="/api/health/" class="btn btn-secondary">API Health Check</a>
        </div>

        <div class="section-title">Available REST API Endpoints</div>
        <ul class="endpoints">
            <li><a href="/api/health/">GET /api/health/</a></li>
            <li><a href="/api/auth/token/">POST /api/auth/token/</a></li>
            <li><a href="/api/customers/">GET /api/customers/</a></li>
            <li><a href="/api/policies/">GET /api/policies/</a></li>
            <li><a href="/api/claims/">GET /api/claims/</a></li>
            <li><a href="/api/reinsurance/">GET /api/reinsurance/</a></li>
            <li><a href="/api/dashboard/">GET /api/dashboard/</a></li>
            <li><a href="/api/ai/">POST /api/ai/</a></li>
        </ul>
    </div>
</body>
</html>"""
    return HttpResponse(html_content, content_type='text/html')


urlpatterns = [
    path('', root_index_view, name='root-index'),
    path('admin/', admin.site.urls),
    path('api/health/', HealthAPIView.as_view(), name='health'),
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
