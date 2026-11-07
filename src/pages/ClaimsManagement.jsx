import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  FileText,
  X,
  ShieldCheck,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { analyzeInsuranceDocument } from '../services/api.js';

export default function ClaimsManagement() {
  const {
    claims,
    policies,
    currentUser,
    submitClaim,
    updateClaimStatus,
    logApiCall,
    apiMode,
    djangoStatus,
    restoreLiveSession,
    isSessionLoading,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedClaimId, setSelectedClaimId] = useState(claims[0]?.id || null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Synchronize selectedClaimId when claims change (e.g. after live data fetch or refresh)
  useEffect(() => {
    if (claims && claims.length > 0) {
      const exists = claims.some((c) => c.id === selectedClaimId);
      if (!exists) {
        setSelectedClaimId(claims[0].id);
      }
    } else {
      setSelectedClaimId(null);
    }
  }, [claims, selectedClaimId]);

  // AI Advisory State inside Claims Workbench
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvisoryResult, setAiAdvisoryResult] = useState(null);

  // FNOL Form State
  const [claimForm, setClaimForm] = useState({
    policyId: policies[0]?.id || 'POL-COM-9317',
    incidentDate: '2026-11-02',
    amount: 145000,
    description:
      'Water ingress and electrical switchgear short-circuit in Secondary Cold Storage Wing following municipal main rupture.',
    uploadedFiles: [
      { name: 'Field_Adjuster_Damage_Photos.pdf', size: '2.8 MB', uploadedAt: '2026-11-06' },
    ],
  });

  // Synchronize default policy in FNOL modal when live policies load
  useEffect(() => {
    if (policies && policies.length > 0) {
      setClaimForm((prev) => ({
        ...prev,
        policyId: policies.some((p) => p.id === prev.policyId) ? prev.policyId : policies[0].id,
      }));
    }
  }, [policies]);

  const selectedClaim = useMemo(
    () => claims.find((c) => c.id === selectedClaimId) || claims[0] || null,
    [claims, selectedClaimId]
  );

  const filteredClaims = useMemo(() => {
    if (statusFilter === 'All') return claims;
    return claims.filter((c) => c.status === statusFilter);
  }, [claims, statusFilter]);

  const canReviewClaims =
    currentUser?.role === 'Admin' || currentUser?.role === 'Agent';

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: `${Math.max(120, Math.round(f.size / 1024))} KB`,
      uploadedAt: new Date().toISOString().split('T')[0],
    }));
    setClaimForm((prev) => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...mapped],
    }));
  };

  const handleFNOLSubmit = async (e) => {
    e.preventDefault();
    const created = await submitClaim({
      policyId: claimForm.policyId,
      incidentDate: claimForm.incidentDate,
      amount: claimForm.amount,
      description: claimForm.description,
      supportingDocs: claimForm.uploadedFiles,
    });
    if (created?.id) {
      setSelectedClaimId(created.id);
    }
    setShowSubmitModal(false);
    setAiAdvisoryResult(null);
  };

  const runAIClaimAdvisory = async () => {
    if (!selectedClaim) return;
    setAiLoading(true);
    try {
      const linkedPolicy = policies.find((p) => p.id === selectedClaim.policyId);
      const result = await analyzeInsuranceDocument({
        mode: 'claim_analysis',
        claimContext: selectedClaim,
        policyContext: linkedPolicy,
        documentText: selectedClaim.description,
        useLiveDjango: apiMode === 'live_django',
      });
      setAiAdvisoryResult(result);
      logApiCall(
        'POST',
        '/api/ai/analyze-document/',
        200,
        `Generated human-in-the-loop AI claim analysis for ${selectedClaim.claimNumber}`
      );
    } catch {
      setAiAdvisoryResult(null);
    } finally {
      setAiLoading(false);
    }
  };

  const handleDecision = (newStatus) => {
    if (!selectedClaim) return;
    updateClaimStatus(
      selectedClaim.id,
      newStatus,
      reviewerNote.trim() || `Human reviewer (${currentUser.name}) set status to ${newStatus}.`
    );
    setReviewerNote('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            DRF Endpoints: GET / POST /api/claims/ · PATCH /api/claims/&#123;id&#125;/ · POST /api/ai/analyze-document/
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Claims Intake, Adjuster Review & Activity Audit Workbench
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowSubmitModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors self-start"
        >
          <Plus className="h-4 w-4" />
          Submit First Notice of Loss (FNOL)
        </button>
      </div>

      {/* Authentication Required / Reconnect Alert for Live Mode */}
      {apiMode === 'live_django' &&
        (djangoStatus.state === 'session_expired' ||
          djangoStatus.state === 'unauthenticated' ||
          currentUser?.role === 'None') && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900 shadow-xs">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm text-amber-900">
                  Live Django Authentication Required
                </h3>
                <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                  {djangoStatus.message ||
                    'Your Live Django session has expired or requires authentication. Synthetic demo data is disabled to prevent cross-environment confusion.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to="/architecture"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 transition-colors"
                  >
                    Go to Live Connect / Login
                  </Link>
                  <button
                    type="button"
                    onClick={restoreLiveSession}
                    disabled={isSessionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSessionLoading ? 'animate-spin' : ''}`} />
                    {isSessionLoading ? 'Restoring...' : 'Retry Session'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {['All', 'Pending Review', 'Approved', 'Rejected'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          Human-in-the-Loop Governance: AI assists adjusters with coverage checks; final decisions require licensed reviewer authorization.
        </div>
      </div>

      {/* Claims Queue + Adjuster Workbench */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Claims Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-6 self-start">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Claim ID</th>
                  <th className="py-3.5 px-4">Insured & Policy</th>
                  <th className="py-3.5 px-4 text-right">Claimed Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {isSessionLoading && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                      Loading claims from PostgreSQL...
                    </td>
                  </tr>
                )}
                {!isSessionLoading && filteredClaims.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                      {apiMode === 'live_django' && djangoStatus.state !== 'connected'
                        ? 'No live claims loaded — authentication required.'
                        : 'No claims match the active status filter.'}
                    </td>
                  </tr>
                )}
                {!isSessionLoading &&
                  filteredClaims.map((claim) => (
                    <tr
                      key={claim.id}
                      onClick={() => {
                        setSelectedClaimId(claim.id);
                        setAiAdvisoryResult(null);
                      }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                        selectedClaim?.id === claim.id ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono-num text-xs font-semibold text-blue-700 whitespace-nowrap">
                        <div>{claim.claimNumber}</div>
                        <div className="text-slate-400 font-normal">{claim.incidentDate}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{claim.customerName}</div>
                        <div className="text-xs text-slate-500">
                          {claim.policyNumber} · {claim.type}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          ${Number(claim.amount || 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">
                          Ceded: ${Number(claim.reinsuranceRecovery || 0).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          {claim.status === 'Approved' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                          {claim.status === 'Pending Review' && (
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          {claim.status === 'Rejected' && (
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                          )}
                          <span>{claim.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Claim Review & Activity History */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 space-y-6">
          {selectedClaim ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono-num font-semibold text-blue-700">
                      {selectedClaim.claimNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Policy {selectedClaim.policyNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>Adjuster: {selectedClaim.assignedAdjuster || 'Marcus Sterling'}</span>
                  </div>
                  <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
                    {selectedClaim.customerName}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={runAIClaimAdvisory}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap self-start"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {aiLoading ? 'Analyzing Claim...' : 'Run AI Claims Advisory'}
                </button>
              </div>

              {/* Financial Breakdown */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Gross Claimed Loss</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-900">
                    ${Number(selectedClaim.amount || 0).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Policy Deductible</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-900">
                    ${Number(selectedClaim.deductible || 0).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Treaty Recovery Est.</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-blue-700">
                    ${Number(selectedClaim.reinsuranceRecovery || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Loss Description & Supporting Documents */}
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-slate-800">Loss Incident Description</div>
                  <p className="mt-1 leading-relaxed text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    {selectedClaim.description}
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-800">
                    Supporting Evidence & Uploaded Documents ({selectedClaim.supportingDocs?.length || 0})
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(selectedClaim.supportingDocs || []).map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-blue-700 shrink-0" />
                          <span className="truncate font-medium text-slate-800">{doc.name}</span>
                        </div>
                        <span className="font-mono-num text-slate-400 ml-2 shrink-0">{doc.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI-Assisted Advisory Panel (if triggered) */}
              {aiAdvisoryResult && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-blue-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-blue-700" />
                      AI-Assisted Claims Triage Report ({aiAdvisoryResult.source})
                    </div>
                    <span className="text-slate-500">Advisory Only</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    <strong>Executive Summary:</strong> {aiAdvisoryResult.analysis?.summary}
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    <strong>Coverage & Limit Check:</strong> {aiAdvisoryResult.analysis?.coverageAssessment}
                  </p>
                  <p className="text-slate-700 leading-relaxed">
                    <strong>Reinsurance Impact:</strong> {aiAdvisoryResult.analysis?.reinsuranceImpact}
                  </p>
                  <div>
                    <strong className="text-slate-900">Human Adjuster Verification Checklist:</strong>
                    <ul className="mt-1 list-disc pl-5 space-y-1 text-slate-700">
                      {(aiAdvisoryResult.analysis?.humanReviewerChecklist || []).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Human Reviewer Decision Controls */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-slate-700" />
                    Human Reviewer Adjudication ({currentUser?.name || 'Reviewer'} · {currentUser?.role || 'Guest'})
                  </span>
                  <span className="text-slate-500">Current: {selectedClaim.status}</span>
                </div>

                {canReviewClaims ? (
                  <>
                    <input
                      type="text"
                      value={reviewerNote}
                      onChange={(e) => setReviewerNote(e.target.value)}
                      placeholder="Enter formal adjudication note or settlement rationale..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision('Approved')}
                        className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
                      >
                        Approve Claim Settlement
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('Pending Review')}
                        className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                      >
                        Hold for Adjuster Inquiry
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('Rejected')}
                        className="rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 transition-colors"
                      >
                        Reject Claim
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-600">
                    Role Restriction: Policyholders (`Customer` role) can submit claims and upload documents, but cannot approve or reject claims. Switch to `Admin` or `Agent` view in the top bar to test adjudication.
                  </div>
                )}
              </div>

              {/* Chronological Claim Activity History */}
              <div>
                <h3 className="text-xs font-semibold text-slate-800 mb-3">
                  Immutable Claim Activity & Audit Log
                </h3>
                <div className="space-y-2.5">
                  {(selectedClaim.activityHistory || []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-semibold text-slate-800">{item.actor}</span>
                        <span className="font-mono-num">{item.timestamp}</span>
                      </div>
                      <p className="mt-1 text-slate-600">{item.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center p-8 text-slate-400">
              <FileText className="h-12 w-12 text-slate-300 mb-3" />
              <div className="text-sm font-semibold text-slate-700">No Claim Selected</div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {apiMode === 'live_django' && djangoStatus.state !== 'connected'
                  ? 'Connect or log in to Live Django to inspect live claims from PostgreSQL.'
                  : 'Select an insurance claim from the workbench queue to review loss documentation and adjust settlement.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Submit FNOL Claim Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Submit First Notice of Loss (FNOL)
              </h2>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFNOLSubmit} className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Select Bound Policy *
                </label>
                <select
                  value={claimForm.policyId}
                  onChange={(e) => setClaimForm({ ...claimForm, policyId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.policyNumber} — {p.customerName} ({p.lineOfBusiness})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Date of Loss Incident *
                  </label>
                  <input
                    type="date"
                    required
                    value={claimForm.incidentDate}
                    onChange={(e) => setClaimForm({ ...claimForm, incidentDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Estimated Gross Loss ($ USD) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1000"
                    value={claimForm.amount}
                    onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Incident Description & Cause of Loss *
                </label>
                <textarea
                  rows={3}
                  required
                  value={claimForm.description}
                  onChange={(e) => setClaimForm({ ...claimForm, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Upload Supporting Documents (Survey Reports, Invoices, Photos)
                </label>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 hover:border-blue-600 hover:bg-blue-50/30">
                  <FileUp className="h-4 w-4 text-blue-700" />
                  <span>Attach Evidence Files (PDF, CSV, JPG)</span>
                  <input type="file" multiple onChange={handleFileChange} className="hidden" />
                </label>

                <div className="mt-2 space-y-1">
                  {claimForm.uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                      <span>{f.name}</span>
                      <span className="font-mono-num text-slate-400">{f.size}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Register Claim & Trigger Triage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
