import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ArrowUpRight, CheckCircle2, AlertTriangle, Clock, Plus } from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { MONTHLY_REVENUE_CLAIMS_DATA, PORTFOLIO_BY_LOB } from '../data/mockData.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const { dashboardMetrics, claims, policies, currentUser } = useApp();
  const [chartTimeframe, setChartTimeframe] = useState('YTD');

  const chartData =
    chartTimeframe === '6M'
      ? MONTHLY_REVENUE_CLAIMS_DATA.slice(-6)
      : MONTHLY_REVENUE_CLAIMS_DATA;

  const kpiCards = [
    {
      label: 'Total Customers',
      value: dashboardMetrics.totalCustomers.toString(),
      subtext: `${dashboardMetrics.activeCustomers} active accounts · KYC verified`,
      actionPath: '/customers',
    },
    {
      label: 'Active Insurance Policies',
      value: dashboardMetrics.activePolicies.toString(),
      subtext: 'Across 5 commercial lines of business',
      actionPath: '/policies',
    },
    {
      label: 'Claims Submitted',
      value: dashboardMetrics.totalClaims.toString(),
      subtext: `$${(dashboardMetrics.totalClaimsVolume / 1000).toFixed(0)}k gross incurred volume`,
      actionPath: '/claims',
    },
    {
      label: 'Pending Claims',
      value: dashboardMetrics.pendingClaims.toString(),
      subtext: 'Awaiting human adjuster determination',
      actionPath: '/claims',
    },
    {
      label: 'Approved Claims',
      value: dashboardMetrics.approvedClaims.toString(),
      subtext: `$${(dashboardMetrics.totalReinsuranceRecoveries / 1000).toFixed(1)}k treaty recovery linked`,
      actionPath: '/claims',
    },
    {
      label: 'Total Premium Revenue',
      value: `$${dashboardMetrics.totalPremiumRevenue.toLocaleString()}`,
      subtext: 'Annualized Gross Written Premium (GWP)',
      actionPath: '/reports',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Workspace Header & Role Context */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Phase 1 Synthetic Demo Environment</span>
            <span aria-hidden="true">·</span>
            <span>Signed in as {currentUser?.name || 'Guest'} ({currentUser?.role || 'None'})</span>
            <span aria-hidden="true">·</span>
            <span>PostgreSQL + DRF Contract Ready</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Underwriting, Claims & Treaty Portfolio Command
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/policies')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Issue Policy
          </button>
          <button
            type="button"
            onClick={() => navigate('/ai-assistant')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            Launch AI Claims & Policy Studio
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 6 Required Executive KPI Metrics */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={() => navigate(kpi.actionPath)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-600"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{kpi.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="mt-3 font-mono-num text-2xl font-bold tracking-tight text-slate-900">
                {kpi.value}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {kpi.subtext}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Primary Analytics Charts Row */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Gross Premium vs Claims & Reinsurance Recoveries */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Gross Written Premium vs. Claims Incurred & Treaty Recoveries
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Monthly cashflow performance ($ USD) · Endpoint: GET /api/dashboard/analytics/
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
              {['6M', 'YTD'].map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setChartTimeframe(tf)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    chartTimeframe === tf
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tf === '6M' ? 'Last 6 Months' : 'Full Year (YTD)'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGwp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
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
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area
                  type="monotone"
                  dataKey="grossPremium"
                  name="Gross Written Premium"
                  stroke="#1d4ed8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorGwp)"
                />
                <Area
                  type="monotone"
                  dataKey="claimsIncurred"
                  name="Gross Claims Incurred"
                  stroke="#d97706"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorClaims)"
                />
                <Area
                  type="monotone"
                  dataKey="reinsuranceRecovery"
                  name="Reinsurance Treaty Recovery"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Line of Business Exposure & Loss Ratio */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Underwriting Book by Line of Business
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Premium concentration & technical loss ratios
            </p>

            <div className="mt-5 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PORTFOLIO_BY_LOB} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="line"
                    width={125}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Premium']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="premium" fill="#1e3a8a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
            {PORTFOLIO_BY_LOB.slice(0, 3).map((item) => (
              <div key={item.line} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium truncate">{item.line}</span>
                <span className="font-mono-num text-slate-500">
                  {item.policies} policies · LR {item.lossRatio}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Active Claims Triage & Policy Renewal Watchlist */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Recent Claims Requiring Adjuster Action */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-7 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Recent Claims & Human Adjuster Queue
              </h2>
              <p className="text-xs text-slate-500">
                AI-assisted triage ready · Human sign-off mandatory for final decision
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/claims')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              View All Claims
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Claim ID</th>
                  <th className="py-3 px-4">Policyholder & Line</th>
                  <th className="py-3 px-4 text-right">Gross Loss</th>
                  <th className="py-3 px-4 text-right">Treaty Cession</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {claims.slice(0, 5).map((claim) => (
                  <tr
                    key={claim.id}
                    onClick={() => navigate('/claims')}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {claim.claimNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{claim.customerName}</div>
                      <div className="text-xs text-slate-500">
                        {claim.type} · {claim.policyNumber}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-medium text-slate-900 whitespace-nowrap">
                      ${claim.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-xs text-slate-600 whitespace-nowrap">
                      ${claim.reinsuranceRecovery.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        {claim.status === 'Approved' && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        )}
                        {claim.status === 'Pending Review' && (
                          <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        {claim.status === 'Rejected' && (
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
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

        {/* Expiring & High-Value Policies */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Active Policies & Renewal Schedule
              </h2>
              <p className="text-xs text-slate-500">
                Coverage limits and proportional treaty attachment
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/policies')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              Manage Policies
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {policies.slice(0, 4).map((pol) => (
              <div
                key={pol.id}
                onClick={() => navigate('/policies')}
                className="cursor-pointer p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-num text-xs font-semibold text-slate-900">
                    {pol.policyNumber}
                  </span>
                  <span className="font-mono-num text-xs text-slate-600">
                    Exp: {pol.expirationDate} · {pol.renewalStatus}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {pol.customerName}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{pol.lineOfBusiness}</span>
                  <span className="font-mono-num text-slate-700">
                    Limit ${(pol.coverageLimit / 1000000).toFixed(1)}M · Ceded {pol.cededPercentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
