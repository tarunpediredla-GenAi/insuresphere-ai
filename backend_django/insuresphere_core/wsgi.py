"""WSGI config for InsureSphere AI project."""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insuresphere_core.settings')

application = get_wsgi_application()
