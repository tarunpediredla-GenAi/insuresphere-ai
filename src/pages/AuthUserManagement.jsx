import React, { useState } from 'react';
import {
  UserCheck,
  Shield,
  KeyRound,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';

export default function AuthUserManagement() {
  const {
    users,
    currentUser,
    switchUserRole,
    registerOrLoginCustomUser,
    updateCurrentUserProfile,
    apiMode,
    testAndSyncDjangoBackend,
  } = useApp();

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({
    name: '',
    email: 'tarunpediredla9966@gmail.com',
    password: '',
    role: 'Admin',
  });

  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || '',
    title: currentUser?.title || '',
    department: currentUser?.department || '',
    licenseNumber: currentUser?.licenseNumber || '',
  });
  const [savedNotice, setSavedNotice] = useState('');

  React.useEffect(() => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name || '',
        title: currentUser.title || '',
        department: currentUser.department || '',
        licenseNumber: currentUser.licenseNumber || '',
      });
    }
  }, [currentUser]);

  const handleRoleSwitch = (role) => {
    switchUserRole(role);
    const target = users.find((u) => u.role === role);
    if (target) {
      setProfileForm({
        name: target.name,
        title: target.title,
        department: target.department,
        licenseNumber: target.licenseNumber,
      });
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const ok = await testAndSyncDjangoBackend({ email: authForm.email, password: authForm.password });
    if (ok) {
      setSavedNotice(`Logged into Django session as ${authForm.email}`);
    } else if (apiMode === 'demo') {
      const loggedIn = registerOrLoginCustomUser(authForm);
      setSavedNotice(`Switched active demo session to ${loggedIn.name} (${loggedIn.role})`);
    } else {
      setSavedNotice('Authentication failed. Check email and password.');
    }
    setTimeout(() => setSavedNotice(''), 4000);
  };

  const handleProfileSave = (e) => {
    e.preventDefault();
    updateCurrentUserProfile(profileForm);
    setSavedNotice('Updated user profile metadata.');
    setTimeout(() => setSavedNotice(''), 4000);
  };

  const rbacMatrix = [
    { capability: 'View Portfolio KPIs & Revenue Analytics', admin: true, agent: true, customer: false },
    { capability: 'Onboard & Edit Insured Customers', admin: true, agent: true, customer: false },
    { capability: 'Bind Insurance Policies & Endorsements', admin: true, agent: true, customer: false },
    { capability: 'Submit First Notice of Loss (FNOL) & Docs', admin: true, agent: true, customer: true },
    { capability: 'Approve / Reject Insurance Claims', admin: true, agent: true, customer: false },
    { capability: 'Create Reinsurance Treaty Contracts', admin: true, agent: false, customer: false },
    { capability: 'Use AI Policy RAG & Clause Explainer', admin: true, agent: true, customer: true },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="text-xs text-slate-500">
          DRF Endpoints: POST /api/auth/login/ · POST /api/auth/register/ · GET / PATCH /api/users/me/
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Authentication, Role-Based Access Control (RBAC) &amp; User Profile
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Phase 1 Synthetic Demo Notice: Simulates SimpleJWT token claims and role permissions locally until connected to the Python Django REST Framework backend in Phase 2–4.
        </p>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Instant Role Switcher Cards (Admin / Insurance Agent / Customer) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {users.slice(0, 3).map((u) => {
          const isCurrent = currentUser.id === u.id;
          return (
            <div
              key={u.id}
              onClick={() => handleRoleSwitch(u.role)}
              className={`cursor-pointer rounded-xl border p-5 transition-colors ${
                isCurrent
                  ? 'border-blue-600 bg-white shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-700">{u.role} Account</span>
                <span className="font-mono-num text-slate-500">{u.id}</span>
              </div>
              <h2 className="mt-1.5 font-display text-base font-bold text-slate-900">
                {u.name}
              </h2>
              <p className="text-xs text-slate-500">{u.title}</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-mono-num text-slate-500">{u.email}</span>
                <span className="font-semibold text-slate-900">
                  {isCurrent ? 'Active Session' : 'Switch Role →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Login / Registration Simulator */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Portal Login &amp; Customer Registration
              </h2>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAuthMode(m)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                    authMode === m
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-sm">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="e.g., Sophia Chen"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Corporate Email Address *
              </label>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Role Selection
                </label>
                <select
                  value={authForm.role}
                  onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="Admin">System Admin</option>
                  <option value="Agent">Insurance Agent / Adjuster</option>
                  <option value="Customer">Customer / Policyholder</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-[#0f172a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              {authMode === 'login'
                ? 'Authenticate via POST /api/auth/login/'
                : 'Register Account via POST /api/auth/register/'}
            </button>
          </form>

          {/* Simulated SimpleJWT Payload Inspector */}
          <div className="rounded-lg bg-slate-900 p-4 text-xs text-slate-300 font-mono-num space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Decoded JWT Claims (Demo Preview)</span>
              <span>HS256 / SimpleJWT</span>
            </div>
            <pre className="overflow-x-auto text-[11px] text-blue-300 leading-relaxed">
{JSON.stringify(
  {
    token_type: 'access',
    user_id: currentUser.id,
    email: currentUser.email,
    role: currentUser.role,
    scopes: currentUser.permissions,
  },
  null,
  2
)}
            </pre>
          </div>
        </div>

        {/* User Profile Editor + RBAC Matrix */}
        <div className="lg:col-span-7 space-y-6">
          {/* User Profile Management */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
              <UserCheck className="h-4 w-4 text-blue-700" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Active User Profile Management ({currentUser.name})
              </h2>
            </div>

            <form onSubmit={handleProfileSave} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Job Title</label>
                <input
                  type="text"
                  value={profileForm.title}
                  onChange={(e) => setProfileForm({ ...profileForm, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Department</label>
                <input
                  type="text"
                  value={profileForm.department}
                  onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">License / Regulatory ID</label>
                <input
                  type="text"
                  value={profileForm.licenseNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, licenseNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>

          {/* Role-Based Access Control Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-700" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Django REST Framework Permission Matrix
                </h2>
              </div>
              <span className="text-xs text-slate-500">Enforced in UI &amp; DRF ViewSets</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                    <th className="py-3 px-4">Platform Capability</th>
                    <th className="py-3 px-4 text-center">Admin</th>
                    <th className="py-3 px-4 text-center">Insurance Agent</th>
                    <th className="py-3 px-4 text-center">Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rbacMatrix.map((row) => (
                    <tr key={row.capability} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{row.capability}</td>
                      <td className="py-3 px-4 text-center">
                        {row.admin ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <Lock className="mx-auto h-3.5 w-3.5 text-slate-300" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.agent ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <Lock className="mx-auto h-3.5 w-3.5 text-slate-300" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.customer ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <Lock className="mx-auto h-3.5 w-3.5 text-slate-300" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
