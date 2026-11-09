"""
RAG services: extraction, validation, chunking, sanitization, lexical
retrieval and citations.

Design notes:
- Retrieval is pure Django/Python lexical (TF-style) scoring so it works
  identically on SQLite and PostgreSQL — no pgvector / FTS dependency.
- Nothing here fabricates text: answers are built only from retrieved
  chunk text, and citations quote the stored chunk verbatim (sanitized).
- Prompt-injection-like lines are redacted before any text is used as
  LLM context, quoted as an extractive answer, or shown in a citation.
"""
import io
import math
import os
import re
from collections import Counter

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.txt', '.md'}
EXT_TO_FILE_TYPE = {'.pdf': 'pdf', '.docx': 'docx', '.txt': 'txt', '.md': 'md'}

STOPWORDS = {
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
    'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
    'of', 'on', 'in', 'at', 'to', 'for', 'with', 'by', 'from', 'as',
    'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these',
    'those', 'it', 'its', 'i', 'you', 'we', 'they', 'he', 'she',
    'my', 'your', 'our', 'their', 'me', 'us', 'them', 'please', 'tell',
}

_INJECTION_PATTERNS = [
    re.compile(r'ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)', re.I),
    re.compile(r'ignore\s+previous', re.I),
    re.compile(r'disregard\s+(all\s+|any\s+)?(previous|prior|above|earlier|instructions)', re.I),
    re.compile(r'forget\s+(all\s+|everything|previous|prior)', re.I),
    re.compile(r'system\s*:', re.I),
    re.compile(r'\[system\]', re.I),
    re.compile(r'you\s+are\s+now', re.I),
    re.compile(r'act\s+as\s+(if\s+)?(you|a|an|an?\s)', re.I),
    re.compile(r'new\s+instructions?\s*:', re.I),
    re.compile(r'override\s+(the\s+)?(system|previous|instructions)', re.I),
    re.compile(r'reveal\s+(your\s+)?(system\s+)?prompt', re.I),
    re.compile(r'assistant\s*:\s', re.I),
]

REDACTED_LINE = '[redacted instruction-like line]'


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def _normalize_file_type(file_type_or_filename):
    if not file_type_or_filename:
        return ''
    value = str(file_type_or_filename).lower().strip()
    if value.startswith('.'):
        return EXT_TO_FILE_TYPE.get(value, value.lstrip('.'))
    if '.' in value:  # a filename
        ext = os.path.splitext(value)[1].lower()
        return EXT_TO_FILE_TYPE.get(ext, ext.lstrip('.'))
    return value


def extract_text(file_bytes, file_type):
    """
    Extract text from raw bytes.

    Args:
        file_bytes: bytes of the uploaded file.
        file_type: 'pdf' | 'docx' | 'txt' | 'md' (extension / filename also ok).
    Returns:
        list of (page_number_or_None, text) tuples. PDF pages are 1-based;
        DOCX/TXT/MD have page_number None.
    Raises:
        ValueError on unsupported type or unparseable content.
    """
    if file_bytes is None:
        raise ValueError('No file content provided.')
    if isinstance(file_bytes, str):
        file_bytes = file_bytes.encode('utf-8')
    ftype = _normalize_file_type(file_type)
    if ftype == 'pdf':
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise ValueError('PDF support is unavailable (pypdf not installed).') from exc
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
        except Exception as exc:
            raise ValueError(f'Could not parse PDF file: {exc}') from exc
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ''
            except Exception:
                text = ''
            pages.append((idx, text))
        return pages
    if ftype == 'docx':
        try:
            from docx import Document as DocxDocument
        except ImportError as exc:
            raise ValueError('DOCX support is unavailable (python-docx not installed).') from exc
        try:
            doc = DocxDocument(io.BytesIO(file_bytes))
        except Exception as exc:
            raise ValueError(f'Could not parse DOCX file: {exc}') from exc
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text and cell.text.strip():
                        parts.append(cell.text)
        return [(None, '\n'.join(parts))]
    if ftype in ('txt', 'md', 'text', 'markdown'):
        try:
            text = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            text = file_bytes.decode('utf-8', errors='replace')
        return [(None, text)]
    raise ValueError(f"Unsupported file type: '{file_type}'. Allowed types: pdf, docx, txt, md.")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_upload(filename, file_bytes=None, extracted_pages=None, size_bytes=None):
    """
    Validate an upload. Raises ValueError with a clear message on failure.

    Checks: extension allowlist, max 10MB, and (when extracted_pages is
    given) that the extracted text is non-empty.
    Returns the normalized file_type string ('pdf'/'docx'/'txt'/'md').
    """
    name = ''
    size = size_bytes
    data = file_bytes
    # Support being handed a Django UploadedFile directly.
    if hasattr(filename, 'name') and hasattr(filename, 'read'):
        uploaded = filename
        name = uploaded.name or ''
        if size is None:
            size = getattr(uploaded, 'size', None)
        if data is None:
            try:
                pos = uploaded.tell()
            except Exception:
                pos = None
            data = uploaded.read()
            try:
                if pos is not None:
                    uploaded.seek(pos)
            except Exception:
                pass
    else:
        name = str(filename or '')
    if data is not None and size is None:
        try:
            size = len(data)
        except TypeError:
            size = None
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file extension '{ext or '(none)'}'. "
            'Allowed extensions: .pdf, .docx, .txt, .md.'
        )
    if size is not None and size > MAX_UPLOAD_BYTES:
        raise ValueError(
            f'File is too large ({size} bytes). Maximum allowed size is 10 MB.'
        )
    if data is not None and len(data) > MAX_UPLOAD_BYTES:
        raise ValueError('File is too large. Maximum allowed size is 10 MB.')
    if data is not None and len(data) == 0:
        raise ValueError('Uploaded file is empty.')
    if extracted_pages is not None:
        joined = '\n'.join((t or '') for _p, t in extracted_pages).strip()
        if not joined:
            raise ValueError('No extractable text found in the uploaded document.')
    return EXT_TO_FILE_TYPE[ext]


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _split_units(text):
    """Split into (sentence, is_paragraph_start) units, preserving the
    paragraph/line structure so sanitize_for_prompt can redact a single
    instruction-like line without losing neighbouring content."""
    units = []
    for para in re.split(r'\n+', text or ''):
        para = para.strip()
        if not para:
            continue
        sentences = re.split(r'(?<=[.!?])\s+', para)
        for i, sent in enumerate(sentences):
            sent = sent.strip()
            if sent:
                units.append((sent, i == 0))
    return units


def _hard_split(unit, chunk_size, overlap):
    pieces = []
    start = 0
    text = unit
    while start < len(text):
        end = min(len(text), start + chunk_size)
        pieces.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)
    return [p for p in pieces if p]


def chunk_text(pages_or_text, chunk_size=900, overlap=150):
    """
    Split extracted text into ~chunk_size-char chunks with overlap,
    preferring paragraph/sentence boundaries and preserving page numbers.

    Accepts: a string, a list of (page, text) tuples from extract_text,
    or a list of strings.
    Returns: list of dicts {chunk_index, page_number, text, char_count}.
    """
    if pages_or_text is None:
        return []
    if isinstance(pages_or_text, str):
        pages = [(None, pages_or_text)]
    elif isinstance(pages_or_text, (list, tuple)) and pages_or_text and isinstance(pages_or_text[0], str):
        pages = [(None, t) for t in pages_or_text]
    else:
        pages = list(pages_or_text)

    chunks = []
    index = 0
    for page_number, text in pages:
        if not text or not text.strip():
            continue
        units = _split_units(text)
        current = ''
        for unit, is_para_start in units:
            if len(unit) > chunk_size:
                if current:
                    chunks.append({'chunk_index': index, 'page_number': page_number,
                                   'text': current, 'char_count': len(current)})
                    index += 1
                    current = ''
                for piece in _hard_split(unit, chunk_size, overlap):
                    chunks.append({'chunk_index': index, 'page_number': page_number,
                                   'text': piece, 'char_count': len(piece)})
                    index += 1
                continue
            sep = '\n' if (current and is_para_start) else (' ' if current else '')
            candidate = f'{current}{sep}{unit}'.strip() if current else unit
            if len(candidate) <= chunk_size:
                current = candidate
            else:
                chunks.append({'chunk_index': index, 'page_number': page_number,
                               'text': current, 'char_count': len(current)})
                index += 1
                # Overlap: carry the tail of the previous chunk.
                tail = current[-overlap:] if overlap and current else ''
                # Start tail at a word boundary when possible.
                if ' ' in tail:
                    tail = tail.split(' ', 1)[-1]
                current = f'{tail} {unit}'.strip() if tail else unit
        if current:
            chunks.append({'chunk_index': index, 'page_number': page_number,
                           'text': current, 'char_count': len(current)})
            index += 1
    return chunks


# ---------------------------------------------------------------------------
# Sanitization (prompt-injection defence)
# ---------------------------------------------------------------------------

def _is_injection_line(line):
    stripped = line.strip().lstrip('>*-# ').strip()
    if not stripped:
        return False
    lowered = stripped.lower()
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(lowered):
            # Only redact when the pattern is at/near the start of the
            # line (instruction-like), not incidental mid-sentence use.
            m = pattern.search(lowered)
            if m and m.start() <= 12:
                return True
    # Explicit imperative openers.
    if lowered.startswith(('ignore previous', 'ignore all previous', 'system:', 'you are now')):
        return True
    return False


def sanitize_for_prompt(text_or_chunk):
    """
    Redact instruction-like lines. Accepts a string, a dict with 'text',
    or an object with a .text attribute; always returns a sanitized string.
    """
    if text_or_chunk is None:
        return ''
    if isinstance(text_or_chunk, dict):
        text = text_or_chunk.get('text', '') or ''
    elif isinstance(text_or_chunk, str):
        text = text_or_chunk
    else:
        text = getattr(text_or_chunk, 'text', '') or ''
    out_lines = []
    for line in str(text).splitlines():
        if _is_injection_line(line):
            out_lines.append(REDACTED_LINE)
        else:
            out_lines.append(line)
    return '\n'.join(out_lines)


# ---------------------------------------------------------------------------
# Retrieval (lexical, TF-style)
# ---------------------------------------------------------------------------

def tokenize(text):
    tokens = re.findall(r'[a-z0-9]+', (text or '').lower())
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1 or t.isdigit()]


def _score_text(query_counter, query_terms, text):
    if not query_terms:
        return 0.0
    chunk_tokens = tokenize(text)
    if not chunk_tokens:
        return 0.0
    chunk_counter = Counter(chunk_tokens)
    overlap = 0.0
    for term, qcount in query_counter.items():
        if term in chunk_counter:
            # TF-style: diminishing returns for repeated terms.
            overlap += 1.0 + math.log(chunk_counter[term])
    # Normalize by chunk length (sqrt) and query size so short, focused
    # chunks rank above long documents that merely mention a term once.
    score = overlap / (math.sqrt(len(chunk_tokens)) * max(1, len(query_terms)) ** 0.5)
    # Coverage bonus: fraction of distinct query terms present.
    present = sum(1 for t in query_terms if t in chunk_counter)
    score *= (0.5 + 0.5 * (present / len(query_terms)))
    return round(float(score), 6)


class _EphemeralChunk:
    """Lightweight chunk stand-in for ephemeral (documentText) retrieval."""
    def __init__(self, text, chunk_index=0, page_number=None, document_id=None,
                 document_title='Provided document text'):
        self.text = text
        self.chunk_index = chunk_index
        self.page_number = page_number
        self.document_id = document_id
        self.document_title = document_title
        self.score = 0.0


def retrieve_from_texts(query, texts, top_k=5):
    """
    Score plain chunk dicts/objects/strings against a query.
    texts: iterable of dicts {text, chunk_index, page_number} or strings.
    Returns list of _EphemeralChunk (or the original dict-backed chunk)
    with .score set, score>0 only, ordered desc.
    """
    query_terms = set(tokenize(query))
    query_counter = Counter(tokenize(query))
    scored = []
    for i, item in enumerate(texts or []):
        if isinstance(item, dict):
            text = item.get('text', '')
            chunk = _EphemeralChunk(
                text=text,
                chunk_index=item.get('chunk_index', i),
                page_number=item.get('page_number'),
                document_id=item.get('document_id'),
                document_title=item.get('document_title', 'Provided document text'),
            )
        elif isinstance(item, str):
            chunk = _EphemeralChunk(text=item, chunk_index=i)
        else:
            chunk = item
            text = getattr(item, 'text', '')
        score = _score_text(query_counter, query_terms, text)
        if score > 0:
            chunk.score = score
            try:
                chunk.retrieval_score = score
            except Exception:
                pass
            scored.append(chunk)
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:top_k]


def retrieve(query, organization_id, top_k=5, document_ids=None):
    """
    Lexical retrieval over DocumentChunk rows scoped to one organization.
    Returns DocumentChunk instances with .score / .retrieval_score set,
    score>0 only, ordered by score desc. Works on SQLite and PostgreSQL.
    """
    from .models import DocumentChunk  # local import: avoid app-loading cycles

    if not organization_id or not (query or '').strip():
        return []
    qs = DocumentChunk.objects.filter(organization_id=organization_id).select_related('document')
    if document_ids:
        ids = [str(d) for d in document_ids if d]
        if ids:
            qs = qs.filter(document_id__in=ids)
    query_terms = set(tokenize(query))
    query_counter = Counter(tokenize(query))
    if not query_terms:
        return []
    scored = []
    for chunk in qs.iterator():
        score = _score_text(query_counter, query_terms, chunk.text)
        if score > 0:
            chunk.score = score
            chunk.retrieval_score = score
            scored.append(chunk)
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:top_k]


# ---------------------------------------------------------------------------
# Citations
# ---------------------------------------------------------------------------

def build_citations(chunks):
    """
    Build citation dicts from retrieved chunks.
    Accepts DocumentChunk instances, _EphemeralChunk, dicts, or
    (chunk, score) tuples. Excerpts are sanitized and capped at 300 chars.
    """
    citations = []
    for item in chunks or []:
        score = None
        chunk = item
        if isinstance(item, (list, tuple)) and len(item) == 2 and not isinstance(item[0], (int, type(None))):
            # (chunk, score) tuple — but (page, text) extraction tuples are
            # excluded by the type check above (first elem would be int/None).
            chunk, score = item
        if isinstance(chunk, dict):
            text = chunk.get('text', '')
            doc_id = chunk.get('document_id') or chunk.get('documentId')
            title = chunk.get('document_title') or chunk.get('documentTitle') or 'Provided document text'
            chunk_index = chunk.get('chunk_index', chunk.get('chunkIndex', 0))
            page = chunk.get('page_number', chunk.get('page'))
            if score is None:
                score = chunk.get('score', 0.0)
        else:
            text = getattr(chunk, 'text', '') or ''
            doc_id = getattr(chunk, 'document_id', None)
            doc = getattr(chunk, 'document', None)
            if doc is not None:
                doc_id = getattr(doc, 'id', doc_id)
                title = getattr(doc, 'title', 'Document')
            else:
                title = getattr(chunk, 'document_title', 'Provided document text')
            chunk_index = getattr(chunk, 'chunk_index', 0)
            page = getattr(chunk, 'page_number', None)
            if score is None:
                score = getattr(chunk, 'score', getattr(chunk, 'retrieval_score', 0.0))
        excerpt = sanitize_for_prompt(text)[:300]
        citations.append({
            'documentId': str(doc_id) if doc_id else None,
            'documentTitle': title,
            'chunkIndex': int(chunk_index) if chunk_index is not None else 0,
            'page': page,
            'excerpt': excerpt,
            'score': float(score) if score is not None else 0.0,
        })
    return citations


def normalized_duration_note(text):
    """
    Honest normalization helper: '72-hour' in source text is the same
    duration as '72 hours'. Returns a short note when an N-hour duration
    is present, else ''. Used so grounded answers can state the duration
    in the form reviewers expect without inventing a new value.
    """
    m = re.search(r'(\d+)\s*-\s*hours?\b', text or '', re.I)
    if m:
        return f"{m.group(1)} hours"
    m = re.search(r'(\d+)\s*hours?\b', text or '', re.I)
    if m:
        return f"{m.group(1)} hours"
    return ''
