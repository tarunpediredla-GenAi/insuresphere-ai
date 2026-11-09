/**
 * @vitest-environment jsdom
 *
 * Unit tests for the RAG Knowledge Base service layer.
 * These are unit tests of the service layer only — HTTP is mocked via
 * vi.spyOn(djangoApiClient, ...) and no live Django / Gemini integration
 * is exercised here.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  djangoApiClient,
  djangoUploadDocument,
  djangoFetchDocuments,
  djangoDeleteDocument,
  djangoAskRag,
} from './api.js';

describe('RAG Knowledge Base Service (unit tests, mocked HTTP)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads a document as multipart FormData to POST /ai/documents/', async () => {
    const mockDoc = { id: 7, title: 'Policy Wording.pdf', status: 'indexed', chunkCount: 12 };
    const postSpy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({ data: mockDoc });

    const file = new File(['%PDF-1.4 fake'], 'Policy Wording.pdf', { type: 'application/pdf' });
    const result = await djangoUploadDocument(file);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, body, config] = postSpy.mock.calls[0];
    expect(url).toBe('/ai/documents/');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(result).toEqual(mockDoc);
  });

  it('fetches the document list from GET /ai/documents/ and unwraps paginated results', async () => {
    const docs = [
      { id: 1, title: 'Treaty Slip.docx', chunkCount: 8, status: 'indexed' },
      { id: 2, title: 'Exclusions.md', chunkCount: 3, status: 'indexed' },
    ];
    const getSpy = vi
      .spyOn(djangoApiClient, 'get')
      .mockResolvedValueOnce({ data: { results: docs, count: 2 } });

    const result = await djangoFetchDocuments();

    expect(getSpy).toHaveBeenCalledWith('/ai/documents/');
    expect(result).toEqual(docs);
  });

  it('fetches documents when the API returns a plain array', async () => {
    const docs = [{ id: 3, title: 'Notes.txt', chunkCount: 1, status: 'processing' }];
    vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({ data: docs });

    const result = await djangoFetchDocuments();
    expect(result).toEqual(docs);
  });

  it('deletes a document via DELETE /ai/documents/{id}/', async () => {
    const deleteSpy = vi.spyOn(djangoApiClient, 'delete').mockResolvedValueOnce({ data: null });

    const result = await djangoDeleteDocument(42);

    expect(deleteSpy).toHaveBeenCalledWith('/ai/documents/42/');
    expect(result).toBe(true);
  });

  it('asks a grounded RAG question via POST /ai/ask/ with question and documentIds', async () => {
    const mockAnswer = {
      answer: 'The business interruption waiting period is 72 hours.',
      source: 'django-gemini-rag-grounded',
      citations: [
        {
          documentTitle: 'Policy Wording.pdf',
          chunk: 4,
          page: 12,
          excerpt: 'Business interruption waiting period is 72 hours.',
        },
      ],
    };
    const postSpy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({ data: mockAnswer });

    const result = await djangoAskRag({
      question: 'What is the business interruption waiting period?',
      documentIds: [7, 9],
    });

    expect(postSpy).toHaveBeenCalledWith('/ai/ask/', {
      question: 'What is the business interruption waiting period?',
      documentIds: [7, 9],
    });
    expect(result).toEqual(mockAnswer);
    expect(result.source).toBe('django-gemini-rag-grounded');
    expect(result.citations[0].documentTitle).toBe('Policy Wording.pdf');
  });

  it('asks a RAG question without documentIds (searches all org documents)', async () => {
    const mockAnswer = { answer: 'No evidence.', source: 'rag-no-evidence', citations: [] };
    const postSpy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({ data: mockAnswer });

    const result = await djangoAskRag({ question: 'Is flood covered?' });

    expect(postSpy).toHaveBeenCalledWith('/ai/ask/', { question: 'Is flood covered?' });
    expect(result.source).toBe('rag-no-evidence');
  });

  it('propagates upload errors so the UI can show an error state', async () => {
    vi.spyOn(djangoApiClient, 'post').mockRejectedValueOnce({
      response: { status: 400, data: { detail: 'Unsupported file type.' } },
    });

    const file = new File(['x'], 'malware.exe', { type: 'application/octet-stream' });
    await expect(djangoUploadDocument(file)).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});
