"""URL routing for ai_assistant app (/api/ai/)."""

from django.urls import path
from .views import AIDocumentAnalysisAPIView

urlpatterns = [
    path('analyze-document/', AIDocumentAnalysisAPIView.as_view(), name='ai-analyze-document'),
]
