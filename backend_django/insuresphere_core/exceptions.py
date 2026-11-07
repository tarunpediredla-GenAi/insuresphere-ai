"""
Enterprise JSON Exception Envelope for Django REST Framework.
Ensures every 400/401/403/404/500 error returns a consistent structure to Axios.
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        return Response(
            {
                'success': False,
                'status_code': response.status_code,
                'error': response.data,
                'view': context['view'].__class__.__name__ if context.get('view') else None,
            },
            status=response.status_code,
        )

    if isinstance(exc, DjangoValidationError):
        return Response(
            {
                'success': False,
                'status_code': status.HTTP_400_BAD_REQUEST,
                'error': {'validation_error': exc.messages},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if isinstance(exc, IntegrityError):
        return Response(
            {
                'success': False,
                'status_code': status.HTTP_409_CONFLICT,
                'error': {'database_constraint': 'Record violates a uniqueness or check constraint.'},
            },
            status=status.HTTP_409_CONFLICT,
        )

    return None
