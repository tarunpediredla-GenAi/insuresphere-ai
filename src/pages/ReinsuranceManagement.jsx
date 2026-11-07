import React, { useState, useMemo } from 'react';
import {
  Plus,
  Calculator,
  Download,
  X,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';

export default function ReinsuranceManagement() {
  const { treaties, claims, addTreaty } = useApp();

  const [selectedTreatyId, setSelectedTreatyId] = useState(treaties[0]?.id || 'TRT-2026-01');
  const [simulatedLoss, setSimulatedLoss] = useState(650000);
  const [policyDeductible, setPolicyDeductible] = useState(50000);
  const [showModal, setShowModal] = useState(false);

  const [treatyForm, setTreatyForm] = useState({
    name: '',
    type: 'Proportional Quota Share',
    reinsurerName: 'SCOR Global P&C (Paris)',
    spRating: 'AA-',
    cededSharePct: 45,
    treatyLimit: 30000000,
    attachmentPoint: 100000,
    cededPremiumYTD: 520000,
    effectiveDate: '2026-01-01',
    expirationDate: '2026-12-31',
  });

  const activeTreaty = useMemo(
    () => treaties.find((t) => t.id === selectedTreatyId) || treaties[0],
    [treaties, selectedTreatyId]
  );

  // Interactive Risk-Sharing & Treaty Cession Calculation
  const riskSharingCalc = useMemo(() => {
    if (!activeTreaty) return null;
    const gross = Math.max(0, Number(simulatedLoss) || 0);
    const ded = Math.max(0, Number(policyDeductible) || 0);
    const netEligible = Math.max(0, gross - ded);

    let cededAmount = 0;
    let retainedAmount = netEligible;

    if (activeTreaty.type.includes('Excess of Loss')) {
      const excessSubject = Math.max(0, netEligible - activeTreaty.attachmentPoint);
      cededAmount = Math.min(
        activeTreaty.treatyLimit,
        Math.round(excessSubject * (activeTreaty.cededSharePct / 100))
      );
      retainedAmount = netEligible - cededAmount;
    } else {
      // Quota Share / Surplus Share proportional calculation
      cededAmount = Math.min(
        activeTreaty.treatyLimit,
        Math.round(netEligible * (activeTreaty.cededSharePct / 100))
      );
      retainedAmount = netEligible - cededAmount;
    }

    const effectiveCededPct =
      netEligible > 0 ? ((cededAmount / netEligible) * 100).toFixed(1) : '0.0';

    return {
      gross,
      ded,
      netEligible,
      cededAmount,
      retainedAmount,
      effectiveCededPct,
      cashCallTriggered: cededAmount >= 250000,
    };
  }, [activeTreaty, simulatedLoss, policyDeductible]);

  const handleCreateTreaty = (e) => {
    e.preventDefault();
    if (!treatyForm.name.trim()) return;
    const created = addTreaty(treatyForm);
    setSelectedTreatyId(created.id);
    setShowModal(false);
  };

  const exportTreatyBordereauCSV = () => {
    const headers = [
      'Treaty Code',
      'Treaty Name',
      'Structure',
      'Lead Reinsurer',
      'S&P Rating',
      'Cedant Retention %',
      'Ceded Share %',
      'Treaty Limit USD',
      'Ceded Premium YTD',
      'Recoveries Collected YTD',
    ];
    const rows = treaties.map((t) => [
      t.treatyCode,
      `"${t.name}"`,
      `"${t.type}"`,
      `"${t.reinsurerName}"`,
      t.spRating,
      t.cedantRetentionPct,
      t.cededSharePct,
      t.treatyLimit,
      t.cededPremiumYTD,
      t.recoveriesCollectedYTD,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'InsureSphere_Reinsurance_Bordereau_2026.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            DRF Endpoints: GET / POST /api/reinsurance/treaties/ · Proportional & Excess-of-Loss Cession Engine
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Reinsurance Contracts, Treaty Panel & Recovery Calculator
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportTreatyBordereauCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export Treaty Bordereau (CSV)
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Reinsurance Treaty
          </button>
        </div>
      </div>

      {/* Reinsurance Treaty Directory */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {treaties.map((treaty) => {
          const isSelected = treaty.id === activeTreaty?.id;
          return (
            <div
              key={treaty.id}
              onClick={() => setSelectedTreatyId(treaty.id)}
              className={`cursor-pointer rounded-xl border p-5 transition-colors ${
                isSelected
                  ? 'border-blue-600 bg-white shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono-num font-semibold text-blue-700">
                  {treaty.treatyCode} · {treaty.type}
                </span>
                <span className="font-mono-num font-semibold text-slate-800">
                  S&amp;P {treaty.spRating}
                </span>
              </div>

              <h2 className="mt-1.5 font-display text-base font-bold text-slate-900">
                {treaty.name}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">{treaty.reinsurerName}</p>

              {/* Retention vs Ceded Share Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs font-mono-num mb-1">
                  <span className="text-slate-700">
                    Retained: {treaty.cedantRetentionPct}%
                  </span>
                  <span className="font-semibold text-blue-700">
                    Ceded to Reinsurer: {treaty.cededSharePct}%
                  </span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    style={{ width: `${treaty.cedantRetentionPct}%` }}
                    className="bg-slate-700"
                  />
                  <div
                    style={{ width: `${treaty.cededSharePct}%` }}
                    className="bg-blue-600"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <span className="text-slate-500">Ceded Premium YTD</span>
                  <div className="font-mono-num font-semibold text-slate-900">
                    ${treaty.cededPremiumYTD.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">Recoveries Collected</span>
                  <div className="font-mono-num font-semibold text-emerald-700">
                    ${treaty.recoveriesCollectedYTD.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Risk-Sharing Calculator + Reinsurance Recovery Ledger */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Risk-Sharing Calculator */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 space-y-5">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
              <Calculator className="h-4 w-4" />
              <span>Interactive Actuarial Risk-Sharing Simulator</span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
              Calculate Ceded Recovery & Cedant Retention
            </h2>
            <p className="text-xs text-slate-500">
              Active Contract: <strong className="text-slate-800">{activeTreaty?.name}</strong> ({activeTreaty?.treatyCode})
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Simulated Gross Claim Loss ($ USD)
              </label>
              <input
                type="number"
                step="10000"
                min="0"
                value={simulatedLoss}
                onChange={(e) => setSimulatedLoss(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Underlying Policy Deductible ($ USD)
              </label>
              <input
                type="number"
                step="5000"
                min="0"
                value={policyDeductible}
                onChange={(e) => setPolicyDeductible(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {riskSharingCalc && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Net Eligible Loss</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-900">
                    ${riskSharingCalc.netEligible.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">InsureSphere Retained</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-slate-800">
                    ${riskSharingCalc.retainedAmount.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Reinsurer Recovery</div>
                  <div className="mt-1 font-mono-num text-base font-bold text-blue-700">
                    ${riskSharingCalc.cededAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  Effective Risk Transfer Ratio:{' '}
                  <strong className="font-mono-num text-slate-900">
                    {riskSharingCalc.effectiveCededPct}% Ceded
                  </strong>
                </span>
                <span className="font-medium text-slate-700">
                  {riskSharingCalc.cashCallTriggered
                    ? 'Article 14 Immediate Cash Call Eligible (>$250k)'
                    : 'Standard Quarterly Bordereau Settlement'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Reinsurance Recovery Ledger */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-6">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              Claim-Level Reinsurance Recoverables Ledger
            </h2>
            <p className="text-xs text-slate-500">
              Tracks recoverable amounts per claim across participating treaty panels
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Claim #</th>
                  <th className="py-3 px-4">Insured Account</th>
                  <th className="py-3 px-4 text-right">Gross Loss</th>
                  <th className="py-3 px-4 text-right">Treaty Recovery</th>
                  <th className="py-3 px-4">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {c.claimNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{c.customerName}</div>
                      <div className="text-xs text-slate-500">{c.policyNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-900 whitespace-nowrap">
                      ${c.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-blue-700 whitespace-nowrap">
                      ${c.reinsuranceRecovery.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        {c.status === 'Approved' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Shield className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span>{c.status === 'Approved' ? 'Recoverable Bound' : c.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Reinsurance Treaty Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Register New Reinsurance Treaty Contract
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTreaty} className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Treaty Contract Name *
                </label>
                <input
                  type="text"
                  required
                  value={treatyForm.name}
                  onChange={(e) => setTreatyForm({ ...treatyForm, name: e.target.value })}
                  placeholder="e.g., 2026 North American Casualty Quota Share"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Lead Reinsurer Counterparty *
                  </label>
                  <input
                    type="text"
                    required
                    value={treatyForm.reinsurerName}
                    onChange={(e) => setTreatyForm({ ...treatyForm, reinsurerName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Treaty Structure
                  </label>
                  <select
                    value={treatyForm.type}
                    onChange={(e) => setTreatyForm({ ...treatyForm, type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Proportional Quota Share">Proportional Quota Share</option>
                    <option value="Surplus Share">Surplus Share</option>
                    <option value="Excess of Loss (XoL)">Excess of Loss (XoL)</option>
                    <option value="Facultative Certificate">Facultative Certificate</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Ceded Risk Share (%)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="95"
                    value={treatyForm.cededSharePct}
                    onChange={(e) => setTreatyForm({ ...treatyForm, cededSharePct: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Treaty Limit ($ USD)
                  </label>
                  <input
                    type="number"
                    value={treatyForm.treatyLimit}
                    onChange={(e) => setTreatyForm({ ...treatyForm, treatyLimit: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    S&amp;P Financial Rating
                  </label>
                  <select
                    value={treatyForm.spRating}
                    onChange={(e) => setTreatyForm({ ...treatyForm, spRating: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="AA+">AA+</option>
                    <option value="AA">AA</option>
                    <option value="AA-">AA-</option>
                    <option value="A+">A+</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Bind Reinsurance Treaty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
