import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileCheck2,
  ClipboardList,
  ShieldAlert,
  Sparkles,
  BarChart3,
  UserCheck,
  Server,
  X,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';

const NAV_ITEMS = [
  { to: '/', label: 'Executive Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customer Management', icon: Users },
  { to: '/policies', label: 'Policy Underwriting', icon: FileCheck2 },
  { to: '/claims', label: 'Claims Workbench', icon: ClipboardList },
  { to: '/reinsurance', label: 'Reinsurance Treaties', icon: ShieldAlert },
  { to: '/ai-assistant', label: 'AI Policy & RAG Studio', icon: Sparkles },
  { to: '/reports', label: 'Actuarial Reports', icon: BarChart3 },
  { to: '/auth', label: 'Auth, RBAC & Profile', icon: UserCheck },
  { to: '/architecture', label: 'Django DRF Blueprint', icon: Server },
];

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { currentUser, apiLogs } = useApp();

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0f172a] text-slate-200 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              InsureSphere AI
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="px-3 pb-2 text-xs font-medium text-slate-400">
            Enterprise Modules
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Active RBAC Session & DRF Log Summary */}
        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 rounded-lg bg-slate-900/90 p-3 border border-slate-800">
            <div className="text-xs text-slate-400">Active RBAC Session</div>
            <div className="mt-0.5 text-sm font-semibold text-white truncate">
              {currentUser?.name || 'Guest User'}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              <span>{currentUser?.role || 'None'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{currentUser?.id || ''}</span>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Last REST Call</span>
            <span className="font-mono-num text-slate-300">
              {apiLogs[0]?.method} {apiLogs[0]?.status}
            </span>
          </div>
          <div className="mt-1 truncate font-mono-num text-xs text-slate-400">
            {apiLogs[0]?.endpoint}
          </div>
        </div>
      </aside>
    </>
  );
}
