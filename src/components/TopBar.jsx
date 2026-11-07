import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useApp } from '../context/useApp.js';

const ROUTE_TITLES = {
  '/': 'Executive Risk & Revenue Overview',
  '/customers': 'Customer & Policyholder Directory',
  '/policies': 'Policy Underwriting & Coverage',
  '/claims': 'Claims Intake & Adjuster Workbench',
  '/reinsurance': 'Reinsurance Treaties & Risk Cession',
  '/ai-assistant': 'AI Policy Assistant & RAG Studio',
  '/reports': 'Actuarial Analytics & Export Center',
  '/auth': 'Authentication, RBAC & User Profile',
  '/architecture': 'Django REST Framework & DB Blueprint',
};

export default function TopBar({ onOpenMobileMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, switchUserRole } = useApp();

  const currentTitle = ROUTE_TITLES[location.pathname] || 'Executive Workspace';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-6">
      {/* Zone 1: Single-line Brand / Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          {currentTitle}
        </span>
      </div>

      {/* Zone 2: 3 Concise single-line RBAC Role Links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
        {['Admin', 'Agent', 'Customer'].map((role) => {
          const isCurrent = currentUser?.role === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => switchUserRole(role)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                isCurrent
                  ? 'border-blue-700 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {role} View
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() =>
            navigate(location.pathname === '/claims' ? '/ai-assistant' : '/claims')
          }
          className="rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {location.pathname === '/claims' ? 'Open AI Triage Studio' : 'Review Claims Queue'}
        </button>
      </div>
    </header>
  );
}
