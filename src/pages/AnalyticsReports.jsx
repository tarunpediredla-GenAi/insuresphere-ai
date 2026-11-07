import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Download, Printer, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { MONTHLY_REVENUE_CLAIMS_DATA, PORTFOLIO_BY_LOB } from '../data/mockData.js';

export default function AnalyticsReports() {
  const { customers, policies, claims, treaties, logApiCall } = useApp();
  const [selectedReport, setSelectedReport] = useState('premium_collection');
  const [exportBanner, setExportBanner] = useState('');

  const handleDownloadCSV = () => {
    let filename = 'InsureSphere_Report.csv';
    let headers = [];
    let rows = [];

    if (selectedReport === 'customer_report') {
      filename = 'InsureSphere_Customer_Risk_Report.csv';
      headers = ['Customer ID', 'Name', 'Segment', 'Industry', 'Risk Tier', 'Risk Score', 'Total Premium USD', 'Status'];
      rows = customers.map((c) => [
        c.id,
        `"${c.name}"`,
        c.accountType,
        `"${c.industry}"`,
        c.riskTier,
        c.riskScore,
        c.totalPremium,
        c.status,
      ]);
    } else if (selectedReport === 'claims_analytics') {
      filename = 'InsureSphere_Claims_Actuarial_Report.csv';
      headers = ['Claim Number', 'Policy Number', 'Customer', 'Line of Business', 'Incident Date', 'Gross Loss USD', 'Deductible USD', 'Reinsurance Recovery USD', 'Status'];
      rows = claims.map((c) => [
        c.claimNumber,
        c.policyNumber,
        `"${c.customerName}"`,
        `"${c.type}"`,
        c.incidentDate,
        c.amount,
        c.deductible,
        c.reinsuranceRecovery,
        c.status,
      ]);
    } else {
      filename = 'InsureSphere_Premium_Collection_Schedule.csv';
      headers = ['Policy Number', 'Customer', 'Line of Business', 'Coverage Limit USD', 'Annual Premium USD', 'Billing Cadence', 'Ceded %', 'Expiration Date'];
      rows = policies.map((p) => [
        p.policyNumber,
        `"${p.customerName}"`,
        `"${p.lineOfBusiness}"`,
        p.coverageLimit,
        p.annualPremium,
        p.paymentFrequency,
        p.cededPercentage,
        p.expirationDate,
      ]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logApiCall('GET', `/api/reports/export/?type=${selectedReport}&format=csv`, 200, `Exported ${filename}`);
    setExportBanner(`Downloaded ${filename} successfully.`);
    setTimeout(() => setExportBanner(''), 4000);
  };

  const handleExportPDF = () => {
    logApiCall('GET', `/api/reports/export/?type=${selectedReport}&format=pdf`, 200, `Generated printable PDF actuarial report for ${selectedReport}`);
    setExportBanner('Prepared printable PDF Actuarial Dossier. Launching browser print/PDF dialog...');
    setTimeout(() => {
      window.print();
      setExportBanner('');
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            DRF Endpoints: GET /api/dashboard/analytics/ · GET /api/reports/export/
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Actuarial Analytics, Revenue Dashboards &amp; Regulatory Exports
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            Export Active Report to CSV
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Export / Print PDF Dossier
          </button>
        </div>
      </div>

      {exportBanner && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{exportBanner}</span>
        </div>
      )}

      {/* Report Type Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {[
            { id: 'premium_collection', label: 'Premium Collection & Revenue Report' },
            { id: 'claims_analytics', label: 'Claims Severity & Loss Ratio Report' },
            { id: 'customer_report', label: 'Customer Exposure & KYC Audit Report' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedReport(tab.id)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedReport === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="font-mono-num text-xs text-slate-500">
          Reporting Period: FY 2026 · Currency: USD
        </span>
      </div>

      {/* Dual Analytics Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6">
          <h2 className="font-display text-base font-bold text-slate-900">
            Gross Written Premium vs. Net Earned Revenue
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Net of proportional reinsurance cessions ($ USD)
          </p>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MONTHLY_REVENUE_CLAIMS_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="grossPremium"
                  name="Gross Written Premium"
                  stroke="#1d4ed8"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="netEarned"
                  name="Net Earned Premium (Retained)"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6">
          <h2 className="font-display text-base font-bold text-slate-900">
            Claims Incurred vs. Reinsurance Recoveries by Month
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Demonstrates treaty protection dampening peak catastrophe months
          </p>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_REVENUE_CLAIMS_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="claimsIncurred" name="Gross Claims Incurred" fill="#d97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reinsuranceRecovery" name="Reinsurance Recovery" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Dynamic Actuarial Ledger Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              {selectedReport === 'premium_collection' && 'Premium Collection & Policy Cession Schedule'}
              {selectedReport === 'claims_analytics' && 'Claims Severity, Deductible & Treaty Recovery Schedule'}
              {selectedReport === 'customer_report' && 'Customer Risk Exposure & Underwriting Audit Schedule'}
            </h2>
            <p className="text-xs text-slate-500">
              Ready for immediate CSV download or formatted PDF print output
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          {selectedReport === 'premium_collection' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Policy #</th>
                  <th className="py-3 px-4">Insured Customer</th>
                  <th className="py-3 px-4">Line of Business</th>
                  <th className="py-3 px-4 text-right">Coverage Limit</th>
                  <th className="py-3 px-4 text-right">Annual Premium</th>
                  <th className="py-3 px-4 text-right">Ceded %</th>
                  <th className="py-3 px-4">Billing Cadence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-blue-700">{p.policyNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{p.customerName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.lineOfBusiness}</td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-800">${p.coverageLimit.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">${p.annualPremium.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-600">{p.cededPercentage}%</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.paymentFrequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedReport === 'claims_analytics' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Claim #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Line of Business</th>
                  <th className="py-3 px-4 text-right">Gross Loss</th>
                  <th className="py-3 px-4 text-right">Deductible</th>
                  <th className="py-3 px-4 text-right">Treaty Recovery</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-blue-700">{c.claimNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{c.customerName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{c.type}</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">${c.amount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-600">${c.deductible.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono-num text-blue-700">${c.reinsuranceRecovery.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedReport === 'customer_report' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Industry</th>
                  <th className="py-3 px-4">Risk Tier</th>
                  <th className="py-3 px-4 text-right">Risk Score</th>
                  <th className="py-3 px-4 text-right">Annual Premium</th>
                  <th className="py-3 px-4">KYC Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-blue-700">{c.id}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{c.industry}</td>
                    <td className="py-3 px-4 text-xs text-slate-800">{c.riskTier}</td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700">{c.riskScore}/100</td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">${c.totalPremium.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{c.kycStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
