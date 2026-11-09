"""
Knowledge base models for genuine RAG in InsureSphere AI.

Documents are organization-scoped: every chunk carries a denormalized
organization FK so retrieval can never leak across tenants, on either
SQLite (tests) or PostgreSQL (production).
"""
import uuid
from django.conf import settings
from django.db import models


class KnowledgeDocument(models.Model):
    class Status(models.TextChoices):
        PROCESSING = 'Processing', 'Processing'
        READY = 'Ready', 'Ready'
        FAILED = 'Failed', 'Failed'

    class FileType(models.TextChoices):
        PDF = 'pdf', 'PDF'
        DOCX = 'docx', 'DOCX'
        TXT = 'txt', 'Text'
        MD = 'md', 'Markdown'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='knowledge_documents',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='knowledge_documents',
    )
    title = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10, choices=FileType.choices)
    size_bytes = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PROCESSING, db_index=True
    )
    chunk_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ai_knowledge_document'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.file_type}, {self.status})"


class DocumentChunk(models.Model):
    id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(
        KnowledgeDocument,
        on_delete=models.CASCADE,
        related_name='chunks',
    )
    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='document_chunks',
    )
    chunk_index = models.PositiveIntegerField(default=0)
    page_number = models.PositiveIntegerField(null=True, blank=True)
    text = models.TextField()
    char_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'ai_document_chunk'
        ordering = ['document_id', 'chunk_index']
        indexes = [
            models.Index(fields=['organization', 'document']),
        ]

    def save(self, *args, **kwargs):
        self.char_count = len(self.text or '')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Chunk {self.chunk_index} of {self.document_id}"
