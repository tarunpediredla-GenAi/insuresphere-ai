import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  FileSearch,
  ShieldAlert,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { SAMPLE_POLICY_CLAUSES } from '../data/mockData.js';
import { analyzeInsuranceDocument } from '../services/api.js';

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
    </div>
  );
}
