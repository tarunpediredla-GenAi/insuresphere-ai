import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Eye,
  Edit3,
  Power,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';

export default function CustomerManagement() {
  const {
    customers,
    policies,
    claims,
    addCustomer,
    updateCustomer,
    toggleCustomerStatus,
    deleteCustomer,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [formState, setFormState] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    accountType: 'Corporate',
    industry: '',
    riskTier: 'Low Risk',
    riskScore: 30,
    city: '',
    annualRevenue: '$25,000,000',
  });

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.industry.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAccount = accountFilter === 'All' || c.accountType === accountFilter;
      const matchesRisk = riskFilter === 'All' || c.riskTier === riskFilter;
      return matchesSearch && matchesAccount && matchesRisk;
    });
  }, [customers, searchQuery, accountFilter, riskFilter]);

  const openAddModal = () => {
    setFormState({
      name: '',
      contactPerson: '',
      email: '',
      phone: '+1 (312) 555-0199',
      accountType: 'Corporate',
      industry: 'Logistics & Manufacturing',
      riskTier: 'Low Risk',
      riskScore: 28,
      city: 'New York, NY',
      annualRevenue: '$50,000,000',
    });
    setModalMode('add');
  };

  const openEditModal = (cust) => {
    setFormState({
      id: cust.id,
      name: cust.name,
      contactPerson: cust.contactPerson,
      email: cust.email,
      phone: cust.phone,
      accountType: cust.accountType,
      industry: cust.industry,
      riskTier: cust.riskTier,
      riskScore: cust.riskScore,
      city: cust.city,
      annualRevenue: cust.annualRevenue,
    });
    setModalMode('edit');
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.email.trim()) return;

    if (modalMode === 'add') {
      const created = addCustomer({
        ...formState,
        riskScore: Number(formState.riskScore) || 35,
      });
      setSelectedCustomer(created);
    } else if (modalMode === 'edit' && formState.id) {
      updateCustomer(formState.id, {
        ...formState,
        riskScore: Number(formState.riskScore) || 35,
      });
      if (selectedCustomer?.id === formState.id) {
        setSelectedCustomer((prev) => ({ ...prev, ...formState }));
      }
    }
    setModalMode(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs text-slate-500">
            DRF Endpoints: GET / POST / PATCH / DELETE /api/customers/
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Insured Customer & Policyholder Directory
          </h1>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors self-start"
        >
          <Plus className="h-4 w-4" />
          Add New Customer
        </button>
      </div>

      {/* Search & Segmented Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer ID, company name, contact, or industry..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Account Type Segmented Filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {['All', 'Corporate', 'SME'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAccountFilter(type)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  accountFilter === type
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'All' ? 'All Accounts' : type}
              </button>
            ))}
          </div>

          {/* Risk Tier Segmented Filter */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {['All', 'Low Risk', 'Moderate Risk', 'High Exposure'].map((risk) => (
              <button
                key={risk}
                type="button"
                onClick={() => setRiskFilter(risk)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  riskFilter === risk
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {risk === 'All' ? 'All Risk Tiers' : risk}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Split: Table + 360 Customer Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden ${selectedCustomer ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Customer ID</th>
                  <th className="py-3.5 px-4">Insured Organization</th>
                  <th className="py-3.5 px-4">Industry & Segment</th>
                  <th className="py-3.5 px-4">Underwriting Risk</th>
                  <th className="py-3.5 px-4 text-right">Annual Premium</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="text-sm font-medium text-slate-900">No customers match your filter criteria</div>
                      <p className="mt-1 text-xs text-slate-500">Try clearing the search query or adding a new corporate account.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setAccountFilter('All');
                          setRiskFilter('All');
                        }}
                        className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Reset Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr
                      key={cust.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        selectedCustomer?.id === cust.id ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono-num text-xs font-semibold text-blue-700 whitespace-nowrap">
                        {cust.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{cust.name}</div>
                        <div className="text-xs text-slate-500">
                          {cust.contactPerson} · {cust.email}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-slate-800">{cust.industry}</div>
                        <div className="text-xs text-slate-500">
                          {cust.accountType} · {cust.city}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-slate-800">{cust.riskTier}</div>
                        <div className="font-mono-num text-xs text-slate-500">
                          Score {cust.riskScore}/100
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                        ${Number(cust.totalPremium || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          {cust.status === 'Active' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          <span>{cust.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(cust)}
                            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            title="View 360 Profile"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(cust)}
                            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                            title="Edit Customer"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCustomerStatus(cust.id)}
                            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-amber-600"
                            title={cust.status === 'Active' ? 'Deactivate Customer' : 'Activate Customer'}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedCustomer?.id === cust.id) setSelectedCustomer(null);
                              deleteCustomer(cust.id);
                            }}
                            className="rounded-md p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                            title="Delete Customer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 360 Customer Profile Inspector */}
        {selectedCustomer && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4 space-y-5 self-start">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="font-mono-num text-xs font-semibold text-blue-700">
                  {selectedCustomer.id} · {selectedCustomer.accountType}
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
                  {selectedCustomer.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedCustomer.industry} · {selectedCustomer.city}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">Primary Contact</div>
                <div className="mt-1 font-semibold text-slate-900">{selectedCustomer.contactPerson}</div>
                <div className="mt-0.5 text-slate-500 truncate">{selectedCustomer.email}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-slate-500">Underwriting Tier</div>
                <div className="mt-1 font-semibold text-slate-900">{selectedCustomer.riskTier}</div>
                <div className="mt-0.5 font-mono-num text-slate-500">
                  Score: {selectedCustomer.riskScore}/100 · KYC {selectedCustomer.kycStatus}
                </div>
              </div>
            </div>

            {/* Linked Policies */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Active Bound Policies ({policies.filter((p) => p.customerId === selectedCustomer.id).length})
              </h3>
              <div className="space-y-2">
                {policies
                  .filter((p) => p.customerId === selectedCustomer.id)
                  .map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                      <div className="flex items-center justify-between font-mono-num font-semibold text-slate-900">
                        <span>{p.policyNumber}</span>
                        <span>${p.annualPremium.toLocaleString()}/yr</span>
                      </div>
                      <div className="mt-1 text-slate-600">{p.title}</div>
                    </div>
                  ))}
                {policies.filter((p) => p.customerId === selectedCustomer.id).length === 0 && (
                  <div className="text-xs text-slate-500 italic">No active policies bound yet.</div>
                )}
              </div>
            </div>

            {/* Linked Claims */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Claims History ({claims.filter((c) => c.customerId === selectedCustomer.id).length})
              </h3>
              <div className="space-y-2">
                {claims
                  .filter((c) => c.customerId === selectedCustomer.id)
                  .map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                      <div className="flex items-center justify-between font-mono-num">
                        <span className="font-semibold text-slate-900">{c.claimNumber}</span>
                        <span className="text-slate-700">${c.amount.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-slate-500">
                        {c.status} · Filed {c.submittedDate}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Customer Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {modalMode === 'add' ? 'Onboard New Insured Customer' : `Edit Customer ${formState.id}`}
              </h2>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Organization / Insured Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="e.g., Horizon Maritime Freight Ltd."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Primary Risk Contact *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.contactPerson}
                    onChange={(e) => setFormState({ ...formState, contactPerson: e.target.value })}
                    placeholder="Full Name"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Corporate Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="risk@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Account Segment
                  </label>
                  <select
                    value={formState.accountType}
                    onChange={(e) => setFormState({ ...formState, accountType: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Corporate">Corporate</option>
                    <option value="SME">SME</option>
                    <option value="Individual">Individual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Underwriting Risk Tier
                  </label>
                  <select
                    value={formState.riskTier}
                    onChange={(e) => setFormState({ ...formState, riskTier: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Low Risk">Low Risk</option>
                    <option value="Moderate Risk">Moderate Risk</option>
                    <option value="High Exposure">High Exposure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Actuarial Score (1-100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formState.riskScore}
                    onChange={(e) => setFormState({ ...formState, riskScore: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Industry Sector
                  </label>
                  <input
                    type="text"
                    value={formState.industry}
                    onChange={(e) => setFormState({ ...formState, industry: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Headquarters Location
                  </label>
                  <input
                    type="text"
                    value={formState.city}
                    onChange={(e) => setFormState({ ...formState, city: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  {modalMode === 'add' ? 'Create Customer Record' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
