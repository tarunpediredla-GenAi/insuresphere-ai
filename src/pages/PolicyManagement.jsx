import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Plus,
  FileText,
  Calendar,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';

export default function PolicyManagement() {
  const { policies, customers, treaties, addPolicy, updatePolicy, apiMode } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [lobFilter, setLobFilter] = useState('All');
  const [selectedPolicy, setSelectedPolicy] = useState(policies[0] || null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatAmount = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : 'Not available';
  };

  const [newPolicyForm, setNewPolicyForm] = useState({
    title: '',
    customerId: customers[0]?.customer_code || customers[0]?.customerCode || customers[0]?.id || 'CUST-1001',
    lineOfBusiness: 'Commercial Property',
    coverageLimit: 10000000,
    deductible: 50000,
    annualPremium: 240000,
    paymentFrequency: 'Annual',
    effectiveDate: '2026-11-01',
    expirationDate: '2027-10-31',
    reinsuranceTreatyId: treaties[0]?.treatyCode || treaties[0]?.treaty_code || treaties[0]?.id || '',
    coverageSummary:
      'All-risk commercial coverage for scheduled facilities, machinery breakdown, and 72-hour waiting period business interruption.',
    exclusions:
      'Excludes war, nuclear hazard, prior known defects, and uncertified modifications.',
  });

  const linesOfBusiness = [
    'All',
    'Commercial Property',
    'Cyber Liability',
    'Marine Cargo',
    'General & Product Liability',
    'Energy & Infrastructure',
    'Aviation & Aerospace',
  ];

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      const matchesSearch =
        String(p.policyNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(p.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLob = lobFilter === 'All' || p.lineOfBusiness === lobFilter;
      return matchesSearch && matchesLob;
    });
  }, [policies, searchQuery, lobFilter]);

  useEffect(() => {
    const validCustomerIds = customers.map((c) => c.customer_code || c.customerCode || c.id);
    if (validCustomerIds.length > 0 && !validCustomerIds.includes(newPolicyForm.customerId)) {
      setNewPolicyForm((current) => ({ ...current, customerId: validCustomerIds[0] || '' }));
    }
    const validTreatyIds = treaties.map((t) => t.treatyCode || t.treaty_code || t.id);
    if (validTreatyIds.length > 0) {
      if (newPolicyForm.reinsuranceTreatyId && !validTreatyIds.includes(newPolicyForm.reinsuranceTreatyId)) {
        setNewPolicyForm((current) => ({ ...current, reinsuranceTreatyId: validTreatyIds[0] || '' }));
      }
    } else if (newPolicyForm.reinsuranceTreatyId) {
      setNewPolicyForm((current) => ({ ...current, reinsuranceTreatyId: '' }));
    }
  }, [customers, treaties]);

  const formatApiError = (error) => {
    const data = error.response?.data;
    if (error.response?.status === 401) return 'Your Django session is not authenticated. Reconnect with a valid account.';
    if (error.response?.status === 403) return 'Your account is not authorized to bind policies for this organization.';
    const errorDetails = data?.error && typeof data.error === 'object' ? data.error : data;
    if (errorDetails && typeof errorDetails === 'object') {
      const fieldErrors = Object.entries(errorDetails)
        .flatMap(([field, messages]) => (Array.isArray(messages) ? messages.map((message) => `${field}: ${message}`) : [`${field}: ${messages}`]))
        .join(' ');
      if (fieldErrors) return fieldErrors;
    }
    if (!error.response) return 'Could not connect to Django. Confirm the server is running and the API URL is correct.';
    return data?.detail || `Django rejected the policy (HTTP ${error.response.status}).`;
  };

  const handleCreatePolicy = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!newPolicyForm.title.trim()) {
      setSubmitError('Policy wording / coverage title is required.');
      return;
    }
    if (!newPolicyForm.customerId) {
      setSubmitError('Select an insured customer.');
      return;
    }
    const coverageLimit = Number(newPolicyForm.coverageLimit);
    const deductible = Number(newPolicyForm.deductible);
    const annualPremium = Number(newPolicyForm.annualPremium);
    if (!Number.isFinite(coverageLimit) || coverageLimit <= 0) {
      setSubmitError('Coverage limit must be a positive number.');
      return;
    }
    if (!Number.isFinite(deductible) || deductible < 0) {
      setSubmitError('Deductible must be zero or a positive number.');
      return;
    }
    if (deductible >= coverageLimit) {
      setSubmitError('Deductible must be less than the coverage limit.');
      return;
    }
    if (!Number.isFinite(annualPremium) || annualPremium <= 0) {
      setSubmitError('Annual premium must be a positive number.');
      return;
    }
    if (!newPolicyForm.effectiveDate || !newPolicyForm.expirationDate) {
      setSubmitError('Effective and expiration dates are required.');
      return;
    }
    if (newPolicyForm.expirationDate <= newPolicyForm.effectiveDate) {
      setSubmitError('Expiration date must be after the effective date.');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await addPolicy(newPolicyForm);
      if (!created) throw new Error('Django did not return the created policy.');
      setSelectedPolicy(created);
      setShowCreateModal(false);
    } catch (error) {
      setSubmitError(formatApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenewPolicy = (policy) => {
    const nextYear = Number(policy.expirationDate.slice(0, 4)) + 1;
    const newExp = `${nextYear}${policy.expirationDate.slice(4)}`;
    updatePolicy(policy.id, {
      expirationDate: newExp,
      renewalStatus: 'Renewed (+12M)',
    });
    if (selectedPolicy?.id === policy.id) {
      setSelectedPolicy((prev) => ({
        ...prev,
        expirationDate: newExp,
        renewalStatus: 'Renewed (+12M)',
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            DRF Endpoints: GET / POST / PATCH /api/policies/ · Linked to Reinsurance Treaties
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Insurance Policy Underwriting & Coverage Schedule
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors self-start"
        >
          <Plus className="h-4 w-4" />
          Bind New Insurance Policy
        </button>
      </div>

      {/* Search & Line of Business Filter */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by policy number, insured organization, or coverage title..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {linesOfBusiness.map((lob) => (
            <button
              key={lob}
              type="button"
              onClick={() => setLobFilter(lob)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                lobFilter === lob
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lob}
            </button>
          ))}
        </div>
      </div>

      {/* Policies Grid + Detailed Coverage Wording Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Policy #</th>
                  <th className="py-3.5 px-4">Insured Customer & Coverage</th>
                  <th className="py-3.5 px-4 text-right">Limit / Deductible</th>
                  <th className="py-3.5 px-4 text-right">Annual Premium</th>
                  <th className="py-3.5 px-4">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredPolicies.map((pol) => (
                  <tr
                    key={pol.id}
                    onClick={() => setSelectedPolicy(pol)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedPolicy?.id === pol.id ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono-num text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {pol.policyNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{pol.customerName}</div>
                      <div className="text-xs text-slate-500">
                        {pol.lineOfBusiness} · Ceded {pol.cededPercentage}%
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        ${(pol.coverageLimit / 1000000).toFixed(1)}M
                      </div>
                      <div className="text-xs text-slate-500">
                        Ded: ${(pol.deductible / 1000).toFixed(0)}k
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      ${formatAmount(pol.annualPremium)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-mono-num text-xs text-slate-800">
                        {pol.expirationDate}
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                        {pol.renewalStatus === 'Renewal Due Soon' ? (
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        )}
                        <span>{pol.renewalStatus}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coverage & Reinsurance Inspector */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 self-start space-y-5">
          {selectedPolicy ? (
            <>
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono-num font-semibold text-blue-700">
                    {selectedPolicy.policyNumber}
                  </span>
                  <span>Underwriter: {selectedPolicy.underwriter}</span>
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
                  {selectedPolicy.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Policyholder: <strong className="text-slate-900">{selectedPolicy.customerName}</strong> ({selectedPolicy.customerId})
                </p>
              </div>

              {/* Financial & Treaty Terms Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Aggregate Limit</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-900">
                    {formatAmount(selectedPolicy.coverageLimit)}
                  </div>
                  <div className="mt-0.5 font-mono-num text-slate-500">
                    Deductible: ${formatAmount(selectedPolicy.deductible)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">Annual Gross Premium</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-900">
                    ${formatAmount(selectedPolicy.annualPremium)}
                  </div>
                  <div className="mt-0.5 text-slate-500">
                    Billing: {selectedPolicy.paymentFrequency}
                  </div>
                </div>
              </div>

              {/* Policy Period & Renewal Action */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      Term: {selectedPolicy.effectiveDate} to {selectedPolicy.expirationDate}
                    </div>
                    <div className="text-slate-500">
                      Status: {selectedPolicy.renewalStatus} · Treaty {selectedPolicy.reinsuranceTreatyId} ({selectedPolicy.cededPercentage}% ceded)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRenewPolicy(selectedPolicy)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Extend +12M
                </button>
              </div>

              {/* Insuring Agreement & Exclusions */}
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-700" />
                    Insuring Agreement & Coverage Scope
                  </div>
                  <p className="mt-1.5 leading-relaxed text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    {selectedPolicy.coverageSummary}
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-800">
                    Scheduled Exclusions & Warranties
                  </div>
                  <p className="mt-1.5 leading-relaxed text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    {selectedPolicy.exclusions}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Select a policy from the schedule to inspect coverage terms and reinsurance placement.
            </div>
          )}
        </div>
      </div>

      {/* Create Policy Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Bind New Commercial Insurance Policy
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="mt-4 space-y-4 text-sm">
              {submitError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {submitError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Policy Wording / Coverage Title *
                </label>
                <input
                  type="text"
                  required
                  value={newPolicyForm.title}
                  onChange={(e) => setNewPolicyForm({ ...newPolicyForm, title: e.target.value })}
                  placeholder="e.g., Global All-Risk Property & Business Interruption"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Assign to Customer *
                  </label>
                  <select
                    value={newPolicyForm.customerId}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, customerId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    {customers.map((c) => {
                      const code = c.customer_code || c.customerCode || c.id;
                      return (
                        <option key={code} value={code}>
                          {c.name} ({code})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Line of Business *
                  </label>
                  <select
                    value={newPolicyForm.lineOfBusiness}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, lineOfBusiness: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    {linesOfBusiness
                      .filter((l) => l !== 'All')
                      .map((lob) => (
                        <option key={lob} value={lob}>
                          {lob}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Coverage Limit ($ USD)
                  </label>
                  <input
                    type="number"
                    required
                    value={newPolicyForm.coverageLimit}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, coverageLimit: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Deductible ($ USD)
                  </label>
                  <input
                    type="number"
                    required
                    value={newPolicyForm.deductible}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, deductible: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Annual Premium ($ USD)
                  </label>
                  <input
                    type="number"
                    required
                    value={newPolicyForm.annualPremium}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, annualPremium: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={newPolicyForm.effectiveDate}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, effectiveDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={newPolicyForm.expirationDate}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, expirationDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Reinsurance Treaty
                  </label>
                  <select
                    value={newPolicyForm.reinsuranceTreatyId}
                    onChange={(e) => setNewPolicyForm({ ...newPolicyForm, reinsuranceTreatyId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="">No Treaty / 100% Primary Retention</option>
                    {treaties.map((t) => {
                      const code = t.treatyCode || t.treaty_code || t.id;
                      return (
                        <option key={code} value={code}>
                          {t.name ? `${code} (${t.name})` : code} ({t.cededSharePct || 40}% Ceded)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Coverage Summary & Insuring Clauses
                </label>
                <textarea
                  rows={2}
                  value={newPolicyForm.coverageSummary}
                  onChange={(e) => setNewPolicyForm({ ...newPolicyForm, coverageSummary: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (apiMode === 'live_django' && customers.length === 0)}
                  className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  {isSubmitting ? 'Binding Policy...' : 'Issue & Bind Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
