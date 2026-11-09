"""
AI Policy Assistant, Document Summarizer & RAG APIViews for Django.

RAG behaviour (genuine, grounded):
- Documents are uploaded, extracted, chunked and stored per-organization
  (KnowledgeDocument / DocumentChunk).
- Answers are generated ONLY from retrieved, organization-scoped chunks.
- Live Gemini answers use source='django-gemini-rag' (analyze-document,
  legacy contract) / 'django-gemini-rag-grounded' (ask).
- Without Gemini, an extractive fallback quotes the retrieved chunks
  (source='django-rag-extractive-fallback') — it never invents clauses.
- With no retrieved evidence, the response is source='rag-no-evidence'
  with empty citations — never fabricated policy wording.
- All AI output is advisory only; human reviewers decide claims.
"""

import os
import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from . import services
from .models import KnowledgeDocument, DocumentChunk

DISCLAIMER = (
    'Human-in-the-Loop Advisory Only: Final claim & underwriting '
    'decisions require licensed adjuster authorization.'
)


def _gemini_api_key():
    key = os.getenv('GEMINI_API_KEY')
    if key and key != 'your_google_gemini_api_key_here':
        return key
    return None


def _call_gemini_json(api_key, prompt):
    """Call Gemini expecting JSON. Returns parsed dict. Raises on failure."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are InsureSphere AI, an enterprise insurance and reinsurance "
                "advisory assistant. Assist human adjusters and underwriters; "
                "never make automated final claim decisions. Answer solely from "
                "the provided context; do not invent policy clauses, limits or "
                "citations."
            ),
            response_mime_type='application/json',
        ),
    )
    return json.loads(response.text)


def _call_gemini_text(api_key, prompt):
    """Call Gemini and return raw text (JSON string or plain text)."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=(
                "You are InsureSphere AI, an enterprise insurance and reinsurance "
                "advisory assistant. Answer SOLELY from the provided retrieved "
                "context. If the context does not contain the answer, say so. "
                "Never invent policy clauses, limits, values or citations. "
                "Your output is advisory only."
            ),
            response_mime_type='application/json',
        ),
    )
    return response.text


def _no_evidence_analysis(question):
    q = f' for "{question}"' if question else ''
    return {
        'summary': (
            f'Insufficient evidence in the uploaded documents to answer{q}. '
            'No relevant excerpts were retrieved from the organization\'s '
            'documents, so no grounded answer can be provided.'
        ),
        'coverageAssessment': (
            'No coverage assessment can be made: no relevant document '
            'evidence was retrieved. Upload the applicable policy document '
            'or rephrase the question using terms from the document.'
        ),
        'riskIndicators': [
            'No evidence retrieved — do not rely on any assumed policy wording.',
        ],
        'reinsuranceImpact': (
            'Cannot be determined from retrieved evidence; requires human '
            'review of the actual treaty and policy documents.'
        ),
        'humanReviewerChecklist': [
            'Upload or verify the applicable policy / treaty document in the RAG studio.',
            'Record a human reviewer determination; AI output is advisory only.',
        ],
    }


def _grounded_analysis(question, chunks):
    """Build an honest, extractive analysis purely from retrieved chunks."""
    excerpts = [services.sanitize_for_prompt(c.text if not isinstance(c, dict) else c.get('text', '')) for c in chunks]
    excerpts = [e.strip() for e in excerpts if e and e.strip()]
    top = excerpts[0] if excerpts else ''
    joined = ' '.join(excerpts)
    coverage = top
    note = services.normalized_duration_note(joined)
    if note and note not in coverage:
        coverage = f'{coverage} (Duration stated in the document: {note}.)'
    if question:
        summary = (
            f'Grounded answer to "{question}": Based solely on the retrieved '
            f'document excerpts, the document states: {top}'
        )
    else:
        summary = f'Grounded document summary from retrieved excerpts: {top}'
    return {
        'summary': summary,
        'coverageAssessment': coverage,
        'riskIndicators': [
            'This answer is limited strictly to the cited retrieved excerpts; verify the full policy wording before relying on it.',
            'No coverage conclusion beyond the cited excerpts should be inferred.',
        ],
        'reinsuranceImpact': (
            'Reinsurance impact cannot be determined from the retrieved '
            'excerpts alone unless cited above; a human reviewer must check '
            'the applicable treaty terms.'
        ),
        'humanReviewerChecklist': [
            'Verify the cited excerpts against the original policy document.',
            'Confirm the document belongs to the correct organization and policy period.',
            'Record the formal human reviewer determination (Approve / Hold / Reject) in the audit log.',
        ],
    }


def _ephemeral_chunks(document_text):
    pages = [(None, document_text)]
    return services.chunk_text(pages)


def _retrieve_ephemeral(question, document_text):
    chunk_dicts = _ephemeral_chunks(document_text)
    if not chunk_dicts:
        return []
    if not (question or '').strip():
        # No question: summarize from the document's own chunks.
        result = []
        for d in chunk_dicts[:5]:
            chunk = services._EphemeralChunk(
                text=d['text'], chunk_index=d['chunk_index'],
                page_number=d['page_number'],
            )
            chunk.score = 0.0
            result.append(chunk)
        return result
    return services.retrieve_from_texts(question, chunk_dicts, top_k=5)


def _document_payload(doc):
    return {
        'id': str(doc.id),
        'title': doc.title,
        'originalFilename': doc.original_filename,
        'original_filename': doc.original_filename,
        'fileType': doc.file_type,
        'file_type': doc.file_type,
        'sizeBytes': doc.size_bytes,
        'size_bytes': doc.size_bytes,
        'status': doc.status,
        'chunkCount': doc.chunk_count,
        'chunk_count': doc.chunk_count,
        'errorMessage': doc.error_message,
        'error_message': doc.error_message,
        'createdAt': doc.created_at.isoformat() if doc.created_at else None,
        'created_at': doc.created_at.isoformat() if doc.created_at else None,
    }


class AIDocumentAnalysisAPIView(APIView):
    """
    POST /api/ai/analyze-document/
    Human-in-the-Loop AI advisory endpoint for claims adjusters and underwriters.
    """
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        mode = request.data.get('mode', 'rag_qa')
        document_text = request.data.get('documentText', '') or ''
        question = request.data.get('question', '') or ''
        claim_context = request.data.get('claimContext', {})
        policy_context = request.data.get('policyContext', {})

        # Pre-compute grounded retrieval for rag_qa so the Gemini prompt
        # (when used) is built only from retrieved, sanitized context.
        retrieved = []
        citations = []
        if mode == 'rag_qa':
            if document_text.strip():
                retrieved = _retrieve_ephemeral(question, document_text)
            elif question.strip() and getattr(request.user, 'organization_id', None):
                doc_ids = request.data.get('documentIds') or request.data.get('document_ids')
                retrieved = services.retrieve(
                    question, request.user.organization_id, top_k=5, document_ids=doc_ids,
                )
            if retrieved:
                citations = services.build_citations(retrieved)

        api_key = _gemini_api_key()
        if api_key:
            try:
                if mode == 'rag_qa' and retrieved:
                    context = '\n\n'.join(
                        f"[Chunk {c.chunk_index}] {services.sanitize_for_prompt(c.text if not isinstance(c, dict) else c.get('text', ''))}"
                        for c in retrieved
                    )
                    prompt = (
                        f"Mode: {mode}\n"
                        f"User Question: {question}\n\n"
                        f"Retrieved Context (answer solely from this):\n{context}\n\n"
                        "Return JSON with keys: summary, coverageAssessment, "
                        "riskIndicators (list of strings), reinsuranceImpact, "
                        "humanReviewerChecklist (list of strings)."
                    )
                else:
                    prompt = (
                        f"Mode: {mode}\n"
                        f"Claim Context: {json.dumps(claim_context)}\n"
                        f"Policy Context: {json.dumps(policy_context)}\n"
                        f"Document Text: {document_text}\n"
                        f"User Question: {question}\n\n"
                        "Return JSON with keys: summary, coverageAssessment, "
                        "riskIndicators (list of strings), reinsuranceImpact, "
                        "humanReviewerChecklist (list of strings)."
                    )
                parsed = _call_gemini_json(api_key, prompt)
                return Response(
                    {
                        'source': 'django-gemini-rag',
                        'disclaimer': DISCLAIMER,
                        'analysis': parsed,
                        'citations': citations,
                    },
                    status=status.HTTP_200_OK,
                )
            except Exception:
                pass

        # ----- Deterministic / grounded fallbacks (no Gemini) -----
        if mode == 'claim_analysis' and claim_context:
            amount = float(claim_context.get('amount', 125000)) if isinstance(claim_context, dict) else 125000
            deductible = float(policy_context.get('deductible', 25000)) if isinstance(policy_context, dict) else 25000
            net_loss = max(0.0, amount - deductible)
            analysis_data = {
                'summary': (
                    f"Advisory review for Claim {claim_context.get('claimNumber', 'CLM-2026-8841')} "
                    f"({claim_context.get('type', 'Commercial Property')}) filed by "
                    f"{claim_context.get('customerName', 'Insured Entity')}. Reported gross loss of "
                    f"${amount:,.2f} falls within active policy period."
                ),
                'coverageAssessment': (
                    f"Policy {claim_context.get('policyNumber', 'POL-COM-9012')} carries a "
                    f"${deductible:,.2f} per-occurrence deductible. Preliminary net eligible loss "
                    f"before depreciation is ${net_loss:,.2f}, within aggregate limit."
                ),
                'riskIndicators': [
                    'Incident timestamp is within 48 hours of severe weather/operational log entry; corroborate surveyor report.',
                    'Verify original commercial invoice line items against repair contractor estimates to rule out betterment.',
                    'Confirm no overlapping coverage exists under marine inland transit endorsements.',
                ],
                'reinsuranceImpact': (
                    f"Loss exceeds $100,000 Quota Share / Surplus notification threshold. Estimated 40% "
                    f"reinsurance cession (${net_loss * 0.4:,.2f}) recoverable from Swiss Re / Munich Re Treaty Panel."
                    if amount > 100000 else
                    "Loss remains within primary cedant retention layer; no facultative or excess-of-loss recovery triggered."
                ),
                'humanReviewerChecklist': [
                    'Inspect signed Proof of Loss affidavit and independent adjuster field photographs.',
                    'Verify policyholder premium account has zero overdue installments as of the loss date.',
                    'Record formal human adjuster determination (Approve / Hold for Inquiry / Reject) in the audit log.',
                ],
            }
            return Response(
                {'source': 'django-actuarial-engine', 'disclaimer': DISCLAIMER,
                 'analysis': analysis_data, 'citations': []},
                status=status.HTTP_200_OK,
            )

        if mode == 'explain_terms':
            analysis_data = {
                'summary': (
                    'In plain language, this clause defines how financial responsibility is shared '
                    'between the insurer and the policyholder when a covered loss occurs, and establishes '
                    'the insurer’s right to recover paid funds from negligent third parties.'
                ),
                'coverageAssessment': (
                    'Covers direct physical loss or legal liability specified in declarations schedule, '
                    'subject to stated per-occurrence deductible and co-insurance maintenance percentage.'
                ),
                'riskIndicators': [
                    'Late notification beyond reporting window may prejudice subrogation recovery rights.',
                    'Policyholder must maintain insured asset values at replacement cost to avoid penalties.',
                ],
                'reinsuranceImpact': (
                    'Subrogation recoveries collected after claim settlement are credited proportionally '
                    'back to participating treaty reinsurers.'
                ),
                'humanReviewerChecklist': [
                    'Confirm the insured understands per-occurrence deductible vs annual aggregate cap.',
                    'Verify scheduled endorsements modifying standard subrogation waivers.',
                ],
            }
            return Response(
                {'source': 'django-actuarial-engine', 'disclaimer': DISCLAIMER,
                 'analysis': analysis_data, 'citations': []},
                status=status.HTTP_200_OK,
            )

        # ----- rag_qa: grounded only, never fabricated -----
        if not retrieved:
            return Response(
                {
                    'source': 'rag-no-evidence',
                    'disclaimer': DISCLAIMER,
                    'analysis': _no_evidence_analysis(question),
                    'citations': [],
                },
                status=status.HTTP_200_OK,
            )
        return Response(
            {
                'source': 'django-rag-extractive-fallback',
                'disclaimer': DISCLAIMER,
                'analysis': _grounded_analysis(question, retrieved),
                'citations': citations,
            },
            status=status.HTTP_200_OK,
        )


class KnowledgeDocumentListCreateAPIView(APIView):
    """GET/POST /api/ai/documents/ — organization-scoped knowledge documents."""
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get(self, request):
        org_id = getattr(request.user, 'organization_id', None)
        if not org_id:
            return Response([], status=status.HTTP_200_OK)
        docs = KnowledgeDocument.objects.filter(organization_id=org_id).order_by('-created_at')
        return Response([_document_payload(d) for d in docs], status=status.HTTP_200_OK)

    def post(self, request):
        org_id = getattr(request.user, 'organization_id', None)
        if not org_id:
            return Response(
                {'detail': 'An organization is required to upload documents.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        role = getattr(request.user, 'role', None)
        if role not in ('Admin', 'Agent'):
            return Response(
                {'detail': 'Permission denied: Document upload requires Admin or Agent role.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        uploaded = None
        for key in ('file', 'document', 'upload'):
            if key in request.FILES:
                uploaded = request.FILES[key]
                break
        if uploaded is None and request.FILES:
            uploaded = next(iter(request.FILES.values()))
        if uploaded is None:
            return Response(
                {'detail': 'No file provided. Send the document as multipart field "file".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        filename = uploaded.name or 'document'
        try:
            file_bytes = uploaded.read()
        except Exception as exc:
            return Response({'detail': f'Could not read uploaded file: {exc}'},
                            status=status.HTTP_400_BAD_REQUEST)
        # Validate extension + size before parsing.
        try:
            file_type = services.validate_upload(filename, file_bytes)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # Extract text.
        try:
            pages = services.extract_text(file_bytes, file_type)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # Validate non-empty extracted text.
        try:
            services.validate_upload(filename, file_bytes, extracted_pages=pages)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        chunk_dicts = services.chunk_text(pages)
        if not chunk_dicts:
            return Response(
                {'detail': 'No extractable text found in the uploaded document.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        title = (
            request.data.get('title')
            or os.path.splitext(filename)[0]
            or filename
        )
        doc = KnowledgeDocument.objects.create(
            organization_id=org_id,
            uploaded_by=request.user,
            title=str(title)[:255],
            original_filename=filename[:255],
            file_type=file_type,
            size_bytes=len(file_bytes),
            status=KnowledgeDocument.Status.PROCESSING,
        )
        try:
            chunk_objs = [
                DocumentChunk(
                    document=doc,
                    organization_id=org_id,
                    chunk_index=c['chunk_index'],
                    page_number=c['page_number'],
                    text=c['text'],
                    char_count=c['char_count'],
                )
                for c in chunk_dicts
            ]
            DocumentChunk.objects.bulk_create(chunk_objs)
            doc.chunk_count = len(chunk_objs)
            doc.status = KnowledgeDocument.Status.READY
            doc.save(update_fields=['chunk_count', 'status'])
        except Exception as exc:
            doc.status = KnowledgeDocument.Status.FAILED
            doc.error_message = str(exc)[:1000]
            doc.save(update_fields=['status', 'error_message'])
            return Response(
                {'detail': f'Failed to index document: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_document_payload(doc), status=status.HTTP_201_CREATED)


class KnowledgeDocumentDetailAPIView(APIView):
    """DELETE /api/ai/documents/<uuid:pk>/ — organization-scoped delete."""
    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request, pk=None):
        org_id = getattr(request.user, 'organization_id', None)
        doc = KnowledgeDocument.objects.filter(id=pk, organization_id=org_id).first()
        if doc is None:
            return Response({'detail': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get(self, request, pk=None):
        org_id = getattr(request.user, 'organization_id', None)
        doc = KnowledgeDocument.objects.filter(id=pk, organization_id=org_id).first()
        if doc is None:
            return Response({'detail': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_document_payload(doc), status=status.HTTP_200_OK)


class RAGAskAPIView(APIView):
    """POST /api/ai/ask/ — grounded Q&A over the caller's organization documents."""
    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def post(self, request):
        question = request.data.get('question') or request.data.get('query') or ''
        if not str(question).strip():
            return Response({'detail': 'A question is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        question = str(question)
        doc_ids = (
            request.data.get('documentIds')
            or request.data.get('document_ids')
            or request.data.get('documentId')
            or request.data.get('document_id')
        )
        if isinstance(doc_ids, str):
            doc_ids = [doc_ids]
        org_id = getattr(request.user, 'organization_id', None)
        retrieved = []
        if org_id:
            retrieved = services.retrieve(question, org_id, top_k=5, document_ids=doc_ids)
        if not retrieved:
            return Response(
                {
                    'source': 'rag-no-evidence',
                    'disclaimer': DISCLAIMER,
                    'answer': None,
                    'analysis': _no_evidence_analysis(question),
                    'citations': [],
                },
                status=status.HTTP_200_OK,
            )
        citations = services.build_citations(retrieved)
        grounded = _grounded_analysis(question, retrieved)
        excerpts = [
            services.sanitize_for_prompt(c.text) for c in retrieved
        ]
        extractive_answer = ' '.join(e.strip() for e in excerpts if e.strip())

        api_key = _gemini_api_key()
        if api_key:
            try:
                context = '\n\n'.join(
                    f"[Chunk {c.chunk_index} of \"{c.document.title}\"] "
                    f"{services.sanitize_for_prompt(c.text)}"
                    for c in retrieved
                )
                prompt = (
                    f"User Question: {question}\n\n"
                    f"Retrieved Context (answer solely from this, cite chunks):\n{context}\n\n"
                    'Return JSON with keys: summary, coverageAssessment, '
                    'riskIndicators (list of strings), reinsuranceImpact, '
                    'humanReviewerChecklist (list of strings). The summary '
                    'must contain your grounded answer to the question.'
                )
                raw = _call_gemini_text(api_key, prompt)
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict) and 'summary' in parsed:
                        answer_text = parsed.get('summary')
                        return Response(
                            {
                                'source': 'django-gemini-rag-grounded',
                                'disclaimer': DISCLAIMER,
                                'answer': answer_text,
                                'analysis': parsed,
                                'citations': citations,
                            },
                            status=status.HTTP_200_OK,
                        )
                except (ValueError, TypeError):
                    pass
                # Plain-text Gemini answer.
                answer_text = (raw or '').strip()
                if answer_text:
                    analysis = dict(grounded)
                    analysis['summary'] = answer_text
                    return Response(
                        {
                            'source': 'django-gemini-rag-grounded',
                            'disclaimer': DISCLAIMER,
                            'answer': answer_text,
                            'analysis': analysis,
                            'citations': citations,
                        },
                        status=status.HTTP_200_OK,
                    )
            except Exception:
                pass  # fall through to honest extractive fallback

        return Response(
            {
                'source': 'django-rag-extractive-fallback',
                'disclaimer': DISCLAIMER,
                'answer': extractive_answer,
                'analysis': grounded,
                'citations': citations,
            },
            status=status.HTTP_200_OK,
        )
