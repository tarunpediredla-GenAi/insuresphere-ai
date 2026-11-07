/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CustomerManagement from './pages/CustomerManagement.jsx';
import PolicyManagement from './pages/PolicyManagement.jsx';
import ClaimsManagement from './pages/ClaimsManagement.jsx';
import ReinsuranceManagement from './pages/ReinsuranceManagement.jsx';
import AIAssistant from './pages/AIAssistant.jsx';
import AnalyticsReports from './pages/AnalyticsReports.jsx';
import AuthUserManagement from './pages/AuthUserManagement.jsx';
import ArchitectureBlueprint from './pages/ArchitectureBlueprint.jsx';

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <AppProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-slate-50 text-slate-900">
          {/* Enterprise Navy Sidebar */}
          <Sidebar
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          {/* Main Workspace Canvas */}
          <div className="flex flex-1 flex-col min-w-0">
            <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

            <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<CustomerManagement />} />
                <Route path="/policies" element={<PolicyManagement />} />
                <Route path="/claims" element={<ClaimsManagement />} />
                <Route path="/reinsurance" element={<ReinsuranceManagement />} />
                <Route path="/ai-assistant" element={<AIAssistant />} />
                <Route path="/reports" element={<AnalyticsReports />} />
                <Route path="/auth" element={<AuthUserManagement />} />
                <Route path="/architecture" element={<ArchitectureBlueprint />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
