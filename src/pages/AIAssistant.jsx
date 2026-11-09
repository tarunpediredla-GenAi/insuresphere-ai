import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  BookOpen,
  FileSearch,
  ShieldAlert,
  Send,
  CheckCircle2,
  Upload,
  Trash2,
  FileText,
  Database,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { SAMPLE_POLICY_CLAUSES } from '../data/mockData.js';
import {
  analyzeInsuranceDocument,
  djangoUploadDocument,
  djangoFetchDocuments,
  djangoDeleteDocument,
  djangoAskRag,
} from '../services/api.js';

function normalizeRagDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const chunkValue = doc.chunkCount ?? doc.chunk_count ?? doc.chunks_count ?? doc.num_chunks;
  return {
    id: doc.id ?? doc.pk,
    title: doc.title || doc.name || doc.file_name || doc.filename || 'Untitled document',
    type: doc.fileType || doc.file_type || doc.document_type || doc.type || '',
    chunks: Array.isArray(doc.chunks) ? doc.chunks.length : (chunkValue ?? 0),
    status: doc.status || doc.indexing_status || 'indexed',
  };
}

function normalizeRagCitation(citation) {
  if (!citation || typeof citation !== 'object') return { title: 'Document', excerpt: String(citation || '') };
  return {
    title:
      citation.documentTitle ||
      citation.document_title ||
      citation.title ||
      citation.document ||
      'Document',
    chunk: citation.chunk ?? citation.chunkIndex ?? citation.chunk_index ?? citation.chunk_number ?? citation.chunkNumber,
    page: citation.page ?? citation.page_number ?? citation.pageNumber,
    excerpt: citation.excerpt || citation.text || citation.content || '',
  };
}

function getRagSourceBadge(source) {
  if (source === 'django-gemini-rag-grounded') {
    return {
      label: 'Live Gemini — grounded in your documents',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (source === 'django-rag-extractive-fallback') {
    return {
      label: 'Extractive fallback — quoted from documents, Gemini unavailable',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (source === 'rag-no-evidence') {
    return {
      label: 'No evidence found in uploaded documents',
      className: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }
  return {
    label: source ? `Source: ${source}` : 'Source: unknown',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  };
}

export default function AIAssistant() {
  const { policies, claims, logApiCall, apiMode } = useApp();

  const [activeTool, setActiveTool] = useState('rag_qa'); // 'rag_qa' | 'explain_terms' | 'claim_analysis'
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?.id || 'POL-COM-9012');
  const [selectedClaimId, setSelectedClaimId] = useState(claims[0]?.id || 'CLM-2026-8841');
  const [selectedClauseId, setSelectedClauseId] = useState(SAMPLE_POLICY_CLAUSES[0].id);

  const [customText, setCustomText] = useState(SAMPLE_POLICY_CLAUSES[0].clauseText);
  const [ragQuestion, setRagQuestion] = useState(
    'Does windstorm water damage qualify for coverage, and what is the waiting period for business interruption?'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // --- Knowledge Base / RAG Studio (Live Django mode only) ---
  const isLiveDjango = apiMode === 'live_django';
  const ragFileInputRef = useRef(null);
  const [kbFile, setKbFile] = useState(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadError, setKbUploadError] = useState('');
  const [kbDocs, setKbDocs] = useState([]);
  const [kbDocsLoading, setKbDocsLoading] = useState(false);
  const [kbDocsError, setKbDocsError] = useState('');
  const [kbDeletingId, setKbDeletingId] = useState(null);
  const [kbQuestion, setKbQuestion] = useState('');
  const [kbAsking, setKbAsking] = useState(false);
  const [kbAskError, setKbAskError] = useState('');
  const [kbResult, setKbResult] = useState(null);

  const loadRagDocuments = async () => {
    setKbDocsLoading(true);
    setKbDocsError('');
    try {
      const data = await djangoFetchDocuments();
      const list = Array.isArray(data) ? data : data?.results || [];
      setKbDocs(list.map(normalizeRagDocument));
    } catch (err) {
      setKbDocsError(err.response?.data?.detail || err.message || 'Could not load documents.');
    } finally {
      setKbDocsLoading(false);
    }
  };

  useEffect(() => {
    if (isLiveDjango) {
      loadRagDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveDjango]);

  const handleRagUpload = async (e) => {
    if (e) e.preventDefault();
    if (!kbFile) {
      setKbUploadError('Choose a .pdf, .docx, .txt, or .md file first.');
      return;
    }
    setKbUploading(true);
    setKbUploadError('');
    try {
      const created = await djangoUploadDocument(kbFile);
      if (created && (created.id ?? created.pk) !== undefined) {
        setKbDocs((prev) => [normalizeRagDocument(created), ...prev]);
      } else {
        await loadRagDocuments();
      }
      logApiCall('POST', '/api/ai/documents/', 201, `Uploaded RAG document ${kbFile.name}`);
      setKbFile(null);
      if (ragFileInputRef.current) ragFileInputRef.current.value = '';
    } catch (err) {
      setKbUploadError(
        err.response?.data?.detail || err.response?.data?.file?.[0] || err.message || 'Upload failed.'
      );
      logApiCall('POST', '/api/ai/documents/', err.response?.status || 500, `RAG upload failed: ${err.message}`);
    } finally {
      setKbUploading(false);
    }
  };

  const handleRagDelete = async (docId) => {
    setKbDeletingId(docId);
    setKbDocsError('');
    try {
      await djangoDeleteDocument(docId);
      setKbDocs((prev) => prev.filter((d) => String(d.id) !== String(docId)));
      logApiCall('DELETE', `/api/ai/documents/${docId}/`, 204, `Deleted RAG document ${docId}`);
    } catch (err) {
      setKbDocsError(err.response?.data?.detail || err.message || 'Could not delete document.');
    } finally {
      setKbDeletingId(null);
    }
  };

  const handleRagAsk = async (e) => {
    if (e) e.preventDefault();
    if (!kbQuestion.trim()) return;
    setKbAsking(true);
    setKbAskError('');
    try {
      const documentIds = kbDocs.length > 0 ? kbDocs.map((d) => d.id) : undefined;
      const response = await djangoAskRag({ question: kbQuestion.trim(), documentIds });
      setKbResult(response);
      logApiCall('POST', '/api/ai/ask/', 200, `RAG question answered (source: ${response?.source || 'unknown'})`);
    } catch (err) {
      setKbResult(null);
      setKbAskError(err.response?.data?.detail || err.message || 'RAG question failed.');
      logApiCall('POST', '/api/ai/ask/', err.response?.status || 500, `RAG ask failed: ${err.message}`);
    } finally {
      setKbAsking(false);
    }
  };

  const handleSelectClause = (clause) => {
    setSelectedClauseId(clause.id);
    setCustomText(clause.clauseText);
  };

  const handleRunAnalysis = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const policyContext = policies.find((p) => p.id === selectedPolicyId);
      const claimContext = claims.find((c) => c.id === selectedClaimId);

      const response = await analyzeInsuranceDocument({
        mode: activeTool,
        documentText:
          activeTool === 'explain_terms'
            ? customText
            : activeTool === 'claim_analysis'
            ? claimContext?.description
            : `${policyContext?.title}\nCoverage: ${policyContext?.coverageSummary}\nExclusions: ${policyContext?.exclusions}\nAdditional Wording: ${customText}`,
        question: ragQuestion,
        claimContext,
        policyContext,
        useLiveDjango: apiMode === 'live_django',
      });

      setResult(response);
      logApiCall(
        'POST',
        '/api/ai/analyze-document/',
        200,
        `Executed AI ${activeTool} via Gemini RAG endpoint`
      );
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            Endpoint: POST /api/ai/analyze-document/ · Powered by Google Gemini + Policy RAG Corpus
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            AI Insurance Policy Assistant, Document Summarizer & RAG Studio
          </h1>
        </div>
        <div className="text-xs font-medium text-slate-600 bg-slate-100 px-3.5 py-2 rounded-lg">
          Human-in-the-Loop Governance: AI assists underwriters &amp; adjusters; never makes automated final claim decisions.
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => {
            setActiveTool('rag_qa');
            setResult(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTool === 'rag_qa'
              ? 'bg-[#0f172a] text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileSearch className="h-4 w-4" />
          1. Policy RAG Q&amp;A &amp; Document Summarization
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTool('explain_terms');
            setResult(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTool === 'explain_terms'
              ? 'bg-[#0f172a] text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          2. Explain Policy Terms in Simple Language
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTool('claim_analysis');
            setResult(null);
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            activeTool === 'claim_analysis'
              ? 'bg-[#0f172a] text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          3. AI-Assisted Claims Analysis
        </button>
      </div>

      {/* Workspace Split: Input Configuration vs Structured AI Output */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Input Controls */}
        <form
          onSubmit={handleRunAnalysis}
          className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 space-y-5 self-start"
        >
          {activeTool === 'rag_qa' && (
            <>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Retrieval-Augmented Generation (RAG) Policy Q&amp;A
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select an active policy from the corpus and ask a coverage, sub-limit, or treaty question.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Target Policy Document
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.policyNumber} — {p.title} ({p.customerName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Question for the Policy RAG Assistant
                </label>
                <input
                  type="text"
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  placeholder="Ask about deductibles, waiting periods, exclusions, or reinsurance cession..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  'Summarize coverage limits, deductibles, and key exclusions.',
                  'What is the business interruption waiting period and flood sub-limit?',
                  'How much of this risk is ceded to the reinsurance treaty panel?',
                ].map((sampleQ) => (
                  <button
                    key={sampleQ}
                    type="button"
                    onClick={() => setRagQuestion(sampleQ)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700 transition-colors text-left"
                  >
                    {sampleQ}
                  </button>
                ))}
              </div>
            </>
          )}

          {activeTool === 'explain_terms' && (
            <>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Explain Complex Actuarial &amp; Legal Wording in Plain English
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose a standard insurance/reinsurance clause below or paste any policy paragraph.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Sample Policy &amp; Treaty Clauses
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SAMPLE_POLICY_CLAUSES.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => handleSelectClause(cls)}
                      className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                        selectedClauseId === cls.id
                          ? 'border-blue-600 bg-blue-50/40 font-semibold text-slate-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div>{cls.title}</div>
                      <div className="mt-0.5 text-slate-500 font-normal">{cls.category}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Policy Clause Text to Explain
                </label>
                <textarea
                  rows={4}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </>
          )}

          {activeTool === 'claim_analysis' && (
            <>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  AI-Assisted Claims Triage &amp; Coverage Verification
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Evaluates FNOL descriptions against bound policy limits, deductibles, and treaty thresholds for human adjusters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Submitted Claim for Advisory Analysis
                </label>
                <select
                  value={selectedClaimId}
                  onChange={(e) => setSelectedClaimId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {claims.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.claimNumber} — {c.customerName} (${c.amount.toLocaleString()} · {c.status})
                    </option>
                  ))}
                </select>
              </div>

              {claims.find((c) => c.id === selectedClaimId) && (
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 text-xs space-y-1.5">
                  <div className="font-semibold text-slate-900">
                    Loss Event Snapshot ({claims.find((c) => c.id === selectedClaimId)?.incidentDate})
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {claims.find((c) => c.id === selectedClaimId)?.description}
                  </p>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {loading ? 'Executing Gemini RAG Pipeline...' : 'Run AI Analysis via /api/ai/analyze-document/'}
          </button>
        </form>

        {/* Right: Structured AI Response Panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 self-start">
          {!result && !loading && (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="font-display text-base font-bold text-slate-900">
                Ready for Policy RAG &amp; Underwriting Analysis
              </div>
              <p className="mx-auto max-w-md text-xs text-slate-500 leading-relaxed">
                Click <strong>Run AI Analysis</strong> on the left to query the `/api/ai/analyze-document/` endpoint and generate a structured, citation-backed report with human reviewer checklists.
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-4 py-8">
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
              <div className="h-20 w-full animate-pulse rounded-lg bg-slate-100" />
              <div className="h-16 w-full animate-pulse rounded-lg bg-slate-100" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          )}

          {result && !loading && (
            <div className="space-y-5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="font-semibold text-blue-700">
                    InsureSphere AI Output · Engine: {result.source}
                  </span>
                  <h3 className="mt-0.5 font-display text-base font-bold text-slate-900">
                    Structured Advisory Report
                  </h3>
                </div>
                <span className="text-slate-500">Human Review Required</span>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">
                  1. Executive Summary &amp; Plain-Language Synthesis
                </div>
                <p className="leading-relaxed text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  {result.analysis?.summary}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">
                  2. Coverage Limits, Deductibles &amp; Clause Application
                </div>
                <p className="leading-relaxed text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  {result.analysis?.coverageAssessment}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">
                  3. Underwriting / Claims Risk Indicators
                </div>
                <ul className="space-y-1.5 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-slate-700">
                  {(result.analysis?.riskIndicators || []).map((ind, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono-num text-blue-700 font-semibold">0{i + 1}.</span>
                      <span>{ind}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">
                  4. Reinsurance Treaty &amp; Cession Impact
                </div>
                <p className="leading-relaxed text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  {result.analysis?.reinsuranceImpact}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900">
                  5. Mandatory Human Reviewer Verification Checklist
                </div>
                <div className="space-y-1.5 bg-blue-50/50 p-3.5 rounded-lg border border-blue-200 text-slate-800">
                  {(result.analysis?.humanReviewerChecklist || []).map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-700 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-3">
                {result.disclaimer}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Knowledge Base / RAG Studio — genuine document-grounded retrieval (Live Django only) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-700" />
              Knowledge Base / RAG Studio
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload your own policy &amp; treaty documents, then ask questions answered only from retrieved
              document evidence — with citations. Endpoints: POST /api/ai/documents/ · POST /api/ai/ask/
            </p>
          </div>
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
            Advisory only — human reviewers retain authority over claims decisions.
          </span>
        </div>

        {!isLiveDjango && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            Switch to Live Django Mode to upload documents. The Knowledge Base / RAG Studio is disabled in
            Demo Mode because documents are stored and retrieved from PostgreSQL via the Django backend.
          </div>
        )}

        <fieldset disabled={!isLiveDjango} className={!isLiveDjango ? 'opacity-50 pointer-events-none space-y-5' : 'space-y-5'}>
          {/* Upload */}
          <form onSubmit={handleRagUpload} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Upload a document (.pdf, .docx, .txt, .md)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                ref={ragFileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => {
                  setKbFile(e.target.files?.[0] || null);
                  setKbUploadError('');
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!isLiveDjango || kbUploading || !kbFile}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                {kbUploading ? 'Uploading & indexing...' : 'Upload Document'}
              </button>
            </div>
            {kbUploading && (
              <p className="text-xs text-blue-700" role="status">
                Upload in progress — extracting text, chunking, and indexing into PostgreSQL...
              </p>
            )}
            {kbUploadError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                {kbUploadError}
              </p>
            )}
          </form>

          {/* Document list */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Uploaded Documents</div>
            {kbDocsLoading && <p className="text-xs text-slate-500">Loading documents...</p>}
            {kbDocsError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                {kbDocsError}
              </p>
            )}
            {!kbDocsLoading && isLiveDjango && kbDocs.length === 0 && !kbDocsError && (
              <p className="text-xs text-slate-500">No documents uploaded yet for your organization.</p>
            )}
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {kbDocs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 truncate">{doc.title}</span>
                      <span className="block text-slate-500">
                        {doc.type ? `${doc.type} · ` : ''}{doc.chunks} chunks · {doc.status}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRagDelete(doc.id)}
                    disabled={kbDeletingId === doc.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {kbDeletingId === doc.id ? 'Deleting...' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Ask */}
          <form onSubmit={handleRagAsk} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Ask a question grounded in your uploaded documents
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={kbQuestion}
                onChange={(e) => setKbQuestion(e.target.value)}
                placeholder="Ask only what your documents can answer — no evidence means no answer..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!isLiveDjango || kbAsking || !kbQuestion.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                {kbAsking ? 'Retrieving evidence...' : 'Ask RAG'}
              </button>
            </div>
            {kbAskError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                {kbAskError}
              </p>
            )}
          </form>

          {/* RAG answer + source badge + citations */}
          {kbResult && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${getRagSourceBadge(kbResult.source).className}`}
              >
                {getRagSourceBadge(kbResult.source).label}
              </span>
              <p className="leading-relaxed text-slate-800 whitespace-pre-wrap">
                {kbResult.answer || kbResult.response || ''}
              </p>
              {Array.isArray(kbResult.citations) && kbResult.citations.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-900">Citations</div>
                  <ul className="space-y-2">
                    {kbResult.citations.map((rawCitation, idx) => {
                      const citation = normalizeRagCitation(rawCitation);
                      return (
                        <li key={idx} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="font-semibold text-slate-900">
                            {citation.title}
                            {citation.chunk !== undefined && citation.chunk !== null ? ` · Chunk #${citation.chunk}` : ''}
                            {citation.page !== undefined && citation.page !== null ? ` · Page ${citation.page}` : ''}
                          </div>
                          {citation.excerpt && (
                            <p className="mt-1 leading-relaxed text-slate-600">&ldquo;{citation.excerpt}&rdquo;</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-2">
                Human-in-the-Loop Advisory Only: AI-generated recommendations are advisory only. Human reviewers
                retain authority over claims decisions.
              </p>
            </div>
          )}
        </fieldset>
      </section>
    </div>
  );
}
