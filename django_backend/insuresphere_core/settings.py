"""
Django settings for InsureSphere AI — Enterprise Insurance & Reinsurance Platform.
Configured for PostgreSQL, Django REST Framework (DRF), SimpleJWT, and Organization Multi-Tenancy.
"""

import os
from pathlib import Path
from datetime import timedelta
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Built-in development-only fallback. Production MUST set DJANGO_SECRET_KEY
# to a unique, secret value — startup refuses the dev default when DEBUG=False.
DEV_DEFAULT_SECRET_KEY = 'django-insecure-insuresphere-dev-key-change-in-production-2026'

SECRET_KEY = os.getenv(
    'DJANGO_SECRET_KEY',
    DEV_DEFAULT_SECRET_KEY
)

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',')
    if host.strip()
]

# Application definition — 7 modular domain apps + DRF + SimpleJWT + CORS + Filters
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party enterprise packages
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    # InsureSphere AI Domain Apps
    'accounts',
    'customers',
    'policies',
    'claims',
    'reinsurance',
    'analytics',
    'ai_assistant',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'insuresphere_core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'insuresphere_core.wsgi.application'

# PostgreSQL Relational Database Configuration
DATABASES = {
    'default': {
        'ENGINE': os.getenv('DB_ENGINE', 'django.db.backends.postgresql'),
        'NAME': os.getenv('DB_NAME', 'insuresphere_db'),
        'USER': os.getenv('DB_USER', 'insuresphere_user'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'strong_postgres_password'),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'ATOMIC_REQUESTS': True,
        'CONN_MAX_AGE': 60,
    }
}

# Custom User Model supporting Role-Based Access Control & Organization Isolation
AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ---------------------------------------------------------------------------
# Storage backends
#
# Static files are always served by WhiteNoise (compressed + manifest
# hashed) so the app does not depend on the platform's static file server.
#
# Media (uploaded RAG documents) lives on local disk by default, which is
# fine for local development but is EPHEMERAL on most PaaS hosts. Set
# MEDIA_S3_BUCKET to switch uploads to a private S3-compatible bucket
# (AWS S3, Cloudflare R2, MinIO, ...) with signed URLs:
#   MEDIA_S3_BUCKET        bucket name (presence enables S3 storage)
#   MEDIA_S3_REGION        bucket region (default: ap-south-1)
#   MEDIA_S3_ENDPOINT_URL  custom endpoint for R2/MinIO (unset for AWS S3)
#   MEDIA_S3_ACCESS_KEY    access key id
#   MEDIA_S3_SECRET_KEY    secret access key
# ---------------------------------------------------------------------------
MEDIA_S3_BUCKET = os.getenv('MEDIA_S3_BUCKET')

if MEDIA_S3_BUCKET:
    _default_storage_backend = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_STORAGE_BUCKET_NAME = MEDIA_S3_BUCKET
    AWS_S3_REGION_NAME = os.getenv('MEDIA_S3_REGION', 'ap-south-1')
    AWS_S3_ENDPOINT_URL = os.getenv('MEDIA_S3_ENDPOINT_URL') or None
    AWS_ACCESS_KEY_ID = os.getenv('MEDIA_S3_ACCESS_KEY')
    AWS_SECRET_ACCESS_KEY = os.getenv('MEDIA_S3_SECRET_KEY')
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True  # private bucket: serve via signed URLs
else:
    _default_storage_backend = 'django.core.files.storage.FileSystemStorage'

STORAGES = {
    'default': {
        'BACKEND': _default_storage_backend,
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'insuresphere_core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'EXCEPTION_HANDLER': 'insuresphere_core.exceptions.custom_exception_handler',
}

# SimpleJWT Configuration
SIMPLE_JWT = {
    # Short-lived access tokens (default 30 min, override with
    # JWT_ACCESS_TOKEN_MINUTES). The silent HttpOnly refresh-cookie flow
    # (rotation + blacklist below) renews them without user interaction,
    # so a short lifetime costs no UX and shrinks the token-theft window.
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_ACCESS_TOKEN_MINUTES', '30'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# CORS Configuration for React Frontend
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173'
    ).split(',')
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Production Security Hardening (active only when DEBUG is False)
#
# Required production environment variables:
#   DJANGO_DEBUG=False                 — enables this hardening block
#   DJANGO_SECRET_KEY=<unique secret>  — REQUIRED; startup fails if the
#                                        built-in dev default is still in use
#   DJANGO_ALLOWED_HOSTS=<hostnames>   — comma-separated public hostnames
# Optional:
#   DJANGO_SECURE_SSL_REDIRECT=True    — redirect all HTTP to HTTPS
#                                        (set to False only behind a proxy
#                                        that already terminates/redirects TLS)
# Local development (DJANGO_DEBUG=True, the default) is unchanged.
# ---------------------------------------------------------------------------
if not DEBUG:
    if SECRET_KEY == DEV_DEFAULT_SECRET_KEY:
        raise ImproperlyConfigured(
            'DJANGO_SECRET_KEY must be set to a unique secret value in production; '
            'the built-in development default is not allowed when DEBUG=False.'
        )
    SECURE_SSL_REDIRECT = os.getenv('DJANGO_SECURE_SSL_REDIRECT', 'True').lower() in ('true', '1', 'yes')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    X_FRAME_OPTIONS = 'DENY'
