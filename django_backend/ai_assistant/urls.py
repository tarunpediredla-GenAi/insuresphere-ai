"""URL routing for ai_assistant app (/api/ai/)."""

from django.urls import path
from .views import (
    AIDocumentAnalysisAPIView,
    KnowledgeDocumentListCreateAPIView,
    KnowledgeDocumentDetailAPIView,
    RAGAskAPIView,
)

urlpatterns = [
    path('analyze-document/', AIDocumentAnalysisAPIView.as_view(), name='ai-analyze-document'),
    path('documents/', KnowledgeDocumentListCreateAPIView.as_view(), name='ai-documents'),
    path('documents/<uuid:pk>/', KnowledgeDocumentDetailAPIView.as_view(), name='ai-document-detail'),
    path('ask/', RAGAskAPIView.as_view(), name='ai-ask'),
]
