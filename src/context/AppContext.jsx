import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  INITIAL_USERS,
  INITIAL_CUSTOMERS,
  INITIAL_POLICIES,
  INITIAL_CLAIMS,
  INITIAL_REINSURANCE_TREATIES,
} from '../data/mockData.js';
import {
  getStoredDjangoUrl,
  setStoredDjangoUrl,
  djangoLogin,
  djangoLogout,
  djangoHealthCheck,
  djangoFetchCurrentUser,
  djangoRestoreSession,
  djangoFetchCustomers,
  djangoCreateCustomer,
  djangoUpdateCustomer,
  djangoToggleCustomerStatus,
  djangoDeleteCustomer,
  djangoFetchPolicies,
  djangoFetchTreaties,
  djangoCreatePolicy,
  normalizeDjangoPolicy,
  djangoUpdatePolicy,
  djangoFetchClaims,
  djangoCreateClaim,
  djangoUpdateClaim,
  djangoCreateTreaty,
  djangoFetchAnalytics,
} from '../services/api.js';
import AppContext from './appContextStore.js';

export function AppProvider({ children }) {
  // Operational Mode: 'demo' (Phase 1 Synthetic Data) vs 'live_django' (Phase 2 Real Django DRF Server)
  const getInitialMode = () => {
    const saved = localStorage.getItem('insuresphere_api_mode');
    if (saved === 'demo') return 'demo';
    if (saved === 'live_django') return 'live_django';
    if (getAccessToken() || localStorage.getItem('insuresphere_live_user')) return 'live_django';
    return 'live_django'; // Phase 2 DRF integration defaults to Live Django Mode
  };

  const initialMode = getInitialMode();
  const [apiMode, setApiModeState] = useState(initialMode);
  const [djangoUrl, setDjangoUrlState] = useState(getStoredDjangoUrl());
  const [isSessionLoading, setIsSessionLoading] = useState(initialMode === 'live_django');
  const [djangoStatus, setDjangoStatus] = useState(() => {
    if (initialMode === 'live_django') {
      const cached = localStorage.getItem('insuresphere_live_user');
      if (cached) {
        try {
          const u = JSON.parse(cached);
          return {
            state: 'connected',
            message: `Connected to Live Django DRF. Restored session for ${u.name} (${u.role}).`,
          };
        } catch {}
      }
      return {
        state: 'testing',
        message: 'Restoring Live Django session and PostgreSQL dataset...',
      };
    }
    return {
      state: 'untested',
      message: 'Running in Phase 1 Synthetic Demo Mode. Switch to Live Django Mode once your local Python server is running on port 8000.',
    };
  });

  const [users, setUsers] = useState(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_user');
        if (cached) return JSON.parse(cached);
      } catch {}
      return { id: 'ANONYMOUS', name: 'Restoring Session...', role: 'None', email: '' };
    }
    return INITIAL_USERS[0];
  });
  const [customers, setCustomers] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_customers');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
    return INITIAL_CUSTOMERS;
  });
  const [policies, setPolicies] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_policies');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
    return INITIAL_POLICIES;
  });
  const [claims, setClaims] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_claims');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
    return INITIAL_CLAIMS;
  });
  const [treaties, setTreaties] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_treaties');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
    return INITIAL_REINSURANCE_TREATIES;
  });
  const [liveAnalytics, setLiveAnalytics] = useState(() => {
    if (initialMode === 'live_django') {
      try {
        const cached = localStorage.getItem('insuresphere_live_analytics');
        if (cached) return JSON.parse(cached);
      } catch {}
      return null;
    }
    return null;
  });
  const [apiLogs, setApiLogs] = useState([
    {
      id: 'LOG-101',
      timestamp: '09:00:02',
      method: 'POST',
      endpoint: '/api/auth/login/',
      status: 200,
      summary: '[Demo Mode] Initialized session for Elena Vance (Admin)',
    },
    {
      id: 'LOG-102',
      timestamp: '09:00:03',
      method: 'GET',
      endpoint: '/api/dashboard/analytics/',
      status: 200,
      summary: '[Demo Mode] Loaded portfolio KPIs, GWP metrics, and treaty cession aggregates',
    },
  ]);

  const setApiMode = (mode) => {
    setApiModeState(mode);
    localStorage.setItem('insuresphere_api_mode', mode);
  };

  const logApiCall = (method, endpoint, status, summary) => {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    const modeTag = apiMode === 'live_django' ? '[Live DRF]' : '[Demo]';
    setApiLogs((prev) => [
      {
        id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp,
        method,
        endpoint,
        status,
        summary: `${modeTag} ${summary}`,
      },
      ...prev.slice(0, 34),
    ]);
  };

  const updateDjangoBaseUrl = (newUrl) => {
    setDjangoUrlState(newUrl);
    setStoredDjangoUrl(newUrl);
  };

  /**
   * Secure session restoration with JWT access-token renewal.
   * If valid, fetches live PostgreSQL records including claims.
   * If invalid, DOES NOT fall back to synthetic demo data or Elena Vance.
   */
  const restoreLiveSession = useCallback(async () => {
    setIsSessionLoading(true);
    setDjangoStatus({
      state: 'testing',
      message: 'Restoring authenticated Live Django session...',
    });
    try {
      const sessionResult = await djangoRestoreSession();
      if (sessionResult.success && sessionResult.user) {
        setCurrentUser(sessionResult.user);
        try { localStorage.setItem('insuresphere_live_user', JSON.stringify(sessionResult.user)); } catch {}

        const [liveCustomers, livePolicies, liveTreaties, liveClaims, liveAnalyticsData] = await Promise.all([
          djangoFetchCustomers().catch((err) => {
            console.error('Error fetching live customers:', err);
            return [];
          }),
          djangoFetchPolicies().catch((err) => {
            console.error('Error fetching live policies:', err);
            return [];
          }),
          djangoFetchTreaties().catch((err) => {
            console.error('Error fetching live treaties:', err);
            return [];
          }),
          djangoFetchClaims().catch((err) => {
            console.error('Error fetching live claims:', err);
            return [];
          }),
          sessionResult.user?.role !== 'Customer'
            ? djangoFetchAnalytics().catch((err) => {
                console.error('Error fetching live analytics:', err);
                return null;
              })
            : Promise.resolve(null),
        ]);

        if (Array.isArray(liveCustomers)) {
          setCustomers(liveCustomers);
          try { localStorage.setItem('insuresphere_live_customers', JSON.stringify(liveCustomers)); } catch {}
        }
        if (Array.isArray(livePolicies)) {
          const normalized = livePolicies.map(normalizeDjangoPolicy);
          setPolicies(normalized);
          try { localStorage.setItem('insuresphere_live_policies', JSON.stringify(normalized)); } catch {}
        }
        if (Array.isArray(liveTreaties)) {
          setTreaties(liveTreaties);
          try { localStorage.setItem('insuresphere_live_treaties', JSON.stringify(liveTreaties)); } catch {}
        }
        if (Array.isArray(liveClaims)) {
          setClaims(liveClaims);
          try { localStorage.setItem('insuresphere_live_claims', JSON.stringify(liveClaims)); } catch {}
        }
        if (liveAnalyticsData) {
          setLiveAnalytics(liveAnalyticsData);
          try { localStorage.setItem('insuresphere_live_analytics', JSON.stringify(liveAnalyticsData)); } catch {}
        }

        setDjangoStatus({
          state: 'connected',
          message: `Connected to Live Django DRF. Session restored for ${sessionResult.user.name} (${sessionResult.user.role}). Synced ${liveClaims?.length || 0} claims and ${liveCustomers?.length || 0} customers from PostgreSQL.`,
        });
        logApiCall(
          'GET',
          '/api/auth/me/',
          200,
          `Session restored (${sessionResult.source}) for ${sessionResult.user.name} (${sessionResult.user.role})`
        );
        return true;
      } else {
        // Session expired or unauthenticated: DO NOT fall back to synthetic demo data!
        try {
          localStorage.removeItem('insuresphere_live_user');
          localStorage.removeItem('insuresphere_live_claims');
          localStorage.removeItem('insuresphere_live_policies');
          localStorage.removeItem('insuresphere_live_customers');
          localStorage.removeItem('insuresphere_live_treaties');
        } catch {}
        clearAuthTokens();
        setCurrentUser({
          id: 'ANONYMOUS',
          name: 'Authentication Required',
          role: 'None',
          email: '',
        });
        setCustomers([]);
        setPolicies([]);
        setClaims([]);
        setTreaties([]);
        setDjangoStatus({
          state: 'session_expired',
          message: 'Your Live Django session has expired or requires authentication. Please sign in or reconnect to access live data.',
        });
        logApiCall(
          'GET',
          '/api/auth/me/',
          401,
          'Live session expired or unauthenticated — login required'
        );
        return false;
      }
    } catch (err) {
      try {
        const cachedUser = localStorage.getItem('insuresphere_live_user');
        if (!cachedUser) {
          setCurrentUser({
            id: 'ANONYMOUS',
            name: 'Connection Failed',
            role: 'None',
            email: '',
          });
          setCustomers([]);
          setPolicies([]);
          setClaims([]);
          setTreaties([]);
        }
      } catch {}
      setDjangoStatus({
        state: 'unreachable',
        message: `Could not connect to Django DRF at ${djangoUrl}. Please ensure the server is running on port 8000.`,
      });
      return false;
    } finally {
      setIsSessionLoading(false);
    }
  }, [djangoUrl]);

  useEffect(() => {
    if (apiMode === 'live_django') {
      restoreLiveSession();
    }
  }, []);

  /**
   * Tests real connectivity to the Python Django REST Framework server
   * by authenticating via POST /api/auth/login/ and fetching live PostgreSQL records.
   */
  const testAndSyncDjangoBackend = async (credentials) => {
    const { email, password } = credentials || {};
    if (!email || !password) {
      setDjangoStatus({
        state: 'unreachable',
        message: 'Enter your Django account email and password to connect in Live Mode.',
      });
      return false;
    }
    setDjangoStatus({
      state: 'testing',
      message: `Testing connection to Django DRF at ${djangoUrl}...`,
    });
    try {
      await djangoHealthCheck();
      const authData = await djangoLogin(email, password);

      const [liveCurrentUser, liveCustomers, livePolicies, liveTreaties, liveClaims, liveAnalyticsData] = await Promise.all([
        djangoFetchCurrentUser(),
        djangoFetchCustomers().catch(() => []),
        djangoFetchPolicies().catch(() => []),
        djangoFetchTreaties().catch(() => []),
        djangoFetchClaims().catch(() => []),
        authData?.user?.role !== 'Customer'
          ? djangoFetchAnalytics().catch(() => null)
          : Promise.resolve(null),
      ]);

      const activeUser = liveCurrentUser || authData?.user;
      if (activeUser) {
        setCurrentUser(activeUser);
        try { localStorage.setItem('insuresphere_live_user', JSON.stringify(activeUser)); } catch {}
      }
      if (Array.isArray(liveCustomers)) {
        setCustomers(liveCustomers);
        try { localStorage.setItem('insuresphere_live_customers', JSON.stringify(liveCustomers)); } catch {}
      }
      if (Array.isArray(livePolicies)) {
        const normalized = livePolicies.map(normalizeDjangoPolicy);
        setPolicies(normalized);
        try { localStorage.setItem('insuresphere_live_policies', JSON.stringify(normalized)); } catch {}
      }
      if (Array.isArray(liveTreaties)) {
        setTreaties(liveTreaties);
        try { localStorage.setItem('insuresphere_live_treaties', JSON.stringify(liveTreaties)); } catch {}
      }
      if (Array.isArray(liveClaims)) {
        setClaims(liveClaims);
        try { localStorage.setItem('insuresphere_live_claims', JSON.stringify(liveClaims)); } catch {}
      }
      if (liveAnalyticsData) {
        setLiveAnalytics(liveAnalyticsData);
        try { localStorage.setItem('insuresphere_live_analytics', JSON.stringify(liveAnalyticsData)); } catch {}
      }

      setApiMode('live_django');
      setDjangoStatus({
        state: 'connected',
        message: `Connected to Live Django DRF at ${djangoUrl}. Authenticated as ${activeUser?.name} (${activeUser?.role}). Synced ${liveClaims?.length || 0} claims and ${liveCustomers?.length || 0} customers from PostgreSQL.`,
      });
      logApiCall(
        'POST',
        '/api/auth/login/',
        200,
        `Authenticated as ${activeUser?.name} and synced live PostgreSQL dataset from ${djangoUrl}`
      );
      return true;
    } catch (err) {
      const status = err.response?.status;
      let failureMessage;
      if (!status) {
        failureMessage = `Network connection failed. Confirm Django is running at ${djangoUrl}.`;
      } else if (status === 401) {
        failureMessage = 'HTTP 401: Django rejected the credentials. Check your email and password.';
      } else if (status === 403) {
        failureMessage = 'HTTP 403: User is not authorized.';
      } else {
        failureMessage = `Django returned HTTP ${status}: ${err.response?.data?.detail || err.message || 'API check failed'}`;
      }
      setDjangoStatus({
        state: 'unreachable',
        message: failureMessage,
      });
      logApiCall(
        'POST',
        `${djangoUrl}/auth/login/`,
        status || 'ERR_NETWORK',
        `Live Django connection test failed (${err.message || 'Server offline'})`
      );
      return false;
    }
  };

  const switchToDemoMode = () => {
    try {
      localStorage.removeItem('insuresphere_live_user');
      localStorage.removeItem('insuresphere_live_claims');
      localStorage.removeItem('insuresphere_live_policies');
      localStorage.removeItem('insuresphere_live_customers');
      localStorage.removeItem('insuresphere_live_treaties');
      localStorage.removeItem('insuresphere_live_analytics');
    } catch {}
    setApiMode('demo');
    setLiveAnalytics(null);
    setCurrentUser(INITIAL_USERS[0]); // Elena Vance
    setCustomers(INITIAL_CUSTOMERS);
    setPolicies(INITIAL_POLICIES);
    setClaims(INITIAL_CLAIMS);
    setTreaties(INITIAL_REINSURANCE_TREATIES);
    setDjangoStatus({
      state: 'untested',
      message: 'Switched back to Phase 1 Synthetic Demo Mode.',
    });
    logApiCall('GET', '/demo/reset/', 200, 'Restored Phase 1 synthetic demo dataset');
  };

  const logoutLiveDjango = async () => {
    await djangoLogout();
    try {
      localStorage.removeItem('insuresphere_live_user');
      localStorage.removeItem('insuresphere_live_claims');
      localStorage.removeItem('insuresphere_live_policies');
      localStorage.removeItem('insuresphere_live_customers');
      localStorage.removeItem('insuresphere_live_treaties');
      localStorage.removeItem('insuresphere_live_analytics');
    } catch {}
    setLiveAnalytics(null);
    setCurrentUser({
      id: 'ANONYMOUS',
      name: 'Logged Out',
      role: 'None',
      email: '',
    });
    setCustomers([]);
    setPolicies([]);
    setClaims([]);
    setTreaties([]);
    setDjangoStatus({
      state: 'unauthenticated',
      message: 'You have logged out of your Live Django session. Enter credentials to reconnect.',
    });
    logApiCall('POST', '/api/auth/logout/', 200, 'Logged out of Live Django session');
  };

  // Switch active role or login as another user
  const switchUserRole = (roleName) => {
    if (apiMode === 'live_django') {
      logApiCall(
        'INFO',
        '/api/auth/me/',
        200,
        `Live mode permissions are bound to DB user: ${currentUser.name} (${currentUser.role})`
      );
      return;
    }
    const target = users.find((u) => u.role === roleName) || users[0];
    setCurrentUser(target);
    localStorage.setItem(
      'insuresphere_demo_jwt',
      `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_${target.role.toLowerCase()}_${target.id}`
    );
    logApiCall('POST', '/api/auth/login/', 200, `Switched active RBAC session to ${target.name} (${target.role})`);
  };

  const registerOrLoginCustomUser = ({ name, email, role, title, department }) => {
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      setCurrentUser(existing);
      logApiCall('POST', '/api/auth/login/', 200, `Authenticated ${existing.email} (${existing.role})`);
      return existing;
    }
    const newUser = {
      id: `USR-00${users.length + 1}`,
      name: name || email.split('@')[0],
      email,
      role: role || 'Customer',
      title:
        title ||
        (role === 'Admin'
          ? 'Underwriting Director'
          : role === 'Agent'
          ? 'Licensed Insurance Agent'
          : 'Corporate Policyholder'),
      department: department || 'Commercial Risk Division',
      licenseNumber: `LIC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      permissions:
        role === 'Admin'
          ? ['customers:write', 'policies:write', 'claims:approve', 'reinsurance:manage', 'analytics:export', 'users:admin']
          : role === 'Agent'
          ? ['customers:write', 'policies:write', 'claims:review', 'ai:analyze']
          : ['policies:read_own', 'claims:submit', 'ai:policy_qa'],
    };
    setUsers((prev) => [...prev, newUser]);
    setCurrentUser(newUser);
    logApiCall('POST', '/api/auth/register/', 201, `Registered & authenticated ${newUser.name} (${newUser.role})`);
    return newUser;
  };

  const updateCurrentUserProfile = (updates) => {
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    logApiCall('PATCH', '/api/auth/me/', 200, `Updated user profile for ${updated.name}`);
  };

  // Customer CRUD (supports both Live Django DRF and Synthetic Demo Mode)
  const addCustomer = async (customerData) => {
    if (apiMode === 'live_django') {
      try {
        const created = await djangoCreateCustomer(customerData);
        setCustomers((prev) => [created, ...prev]);
        logApiCall('POST', '/api/customers/', 201, `Created customer ${created.name} in PostgreSQL`);
        return created;
      } catch (err) {
        logApiCall('POST', '/api/customers/', err.response?.status || 500, `Live create error: ${err.message}`);
      }
    }

    const newCustomer = {
      id: `CUST-${1000 + customers.length + 1}`,
      status: 'Active',
      kycStatus: 'Verified',
      activePoliciesCount: 0,
      totalPremium: 0,
      joinedDate: new Date().toISOString().split('T')[0],
      ...customerData,
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    logApiCall('POST', '/api/customers/', 201, `Created customer ${newCustomer.name} (${newCustomer.id})`);
    return newCustomer;
  };

  const updateCustomer = async (id, updates) => {
    if (apiMode === 'live_django') {
      try {
        const updated = await djangoUpdateCustomer(id, updates);
        setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
        logApiCall('PATCH', `/api/customers/${id}/`, 200, `Updated customer ${id} in PostgreSQL`);
        return;
      } catch (err) {
        logApiCall('PATCH', `/api/customers/${id}/`, err.response?.status || 500, `Live update error: ${err.message}`);
      }
    }

    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    logApiCall('PATCH', `/api/customers/${id}/`, 200, `Updated customer record ${id}`);
  };

  const toggleCustomerStatus = async (id) => {
    if (apiMode === 'live_django') {
      try {
        const updated = await djangoToggleCustomerStatus(id);
        setCustomers((prev) => prev.map((c) => (c.id === id ? updated : c)));
        logApiCall('POST', `/api/customers/${id}/toggle-status/`, 200, `Toggled customer ${id} status in PostgreSQL`);
        return;
      } catch (err) {
        logApiCall('POST', `/api/customers/${id}/toggle-status/`, err.response?.status || 500, `Live toggle error: ${err.message}`);
      }
    }

    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextStatus = c.status === 'Active' ? 'Inactive' : 'Active';
        logApiCall('PATCH', `/api/customers/${id}/`, 200, `Changed customer ${id} status to ${nextStatus}`);
        return { ...c, status: nextStatus };
      })
    );
  };

  const deleteCustomer = async (id) => {
    if (apiMode === 'live_django') {
      try {
        await djangoDeleteCustomer(id);
        setCustomers((prev) => prev.filter((c) => c.id !== id));
        logApiCall('DELETE', `/api/customers/${id}/`, 204, `Deleted customer ${id} from PostgreSQL`);
        return;
      } catch (err) {
        logApiCall('DELETE', `/api/customers/${id}/`, err.response?.status || 500, `Live delete error: ${err.message}`);
      }
    }

    setCustomers((prev) => prev.filter((c) => c.id !== id));
    logApiCall('DELETE', `/api/customers/${id}/`, 204, `Deleted customer record ${id}`);
  };

  // Policy CRUD
  const addPolicy = async (policyData) => {
    if (apiMode === 'live_django') {
      try {
        const created = await djangoCreatePolicy(policyData);
        setPolicies((prev) => [created, ...prev]);
        logApiCall('POST', '/api/policies/', 201, `Bound policy ${created.policyNumber} in PostgreSQL`);
        return created;
      } catch (err) {
        logApiCall('POST', '/api/policies/', err.response?.status || 500, `Live policy create error: ${err.message}`);
        throw err;
      }
    }

    const codePrefix =
      policyData.lineOfBusiness === 'Cyber Liability'
        ? 'CYB'
        : policyData.lineOfBusiness === 'Marine Cargo'
        ? 'MAR'
        : policyData.lineOfBusiness === 'Energy & Infrastructure'
        ? 'ENG'
        : 'COM';
    const policyNumber = `POL-${codePrefix}-${Math.floor(9300 + Math.random() * 699)}`;
    const customer = customers.find((c) => c.id === policyData.customerId);
    const treaty = treaties.find((t) => t.id === policyData.reinsuranceTreatyId) || treaties[0];

    const newPolicy = {
      id: policyNumber,
      policyNumber,
      customerName: customer ? customer.name : policyData.customerName || 'Corporate Insured',
      underwriter: currentUser.name,
      cededPercentage: treaty ? treaty.cededSharePct : 40,
      renewalStatus: 'Active',
      ...policyData,
      coverageLimit: Number(policyData.coverageLimit) || 5000000,
      deductible: Number(policyData.deductible) || 25000,
      annualPremium: Number(policyData.annualPremium) || 150000,
    };

    setPolicies((prev) => [newPolicy, ...prev]);

    if (customer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id
            ? {
                ...c,
                activePoliciesCount: c.activePoliciesCount + 1,
                totalPremium: c.totalPremium + newPolicy.annualPremium,
              }
            : c
        )
      );
    }

    logApiCall('POST', '/api/policies/', 201, `Issued policy ${policyNumber} for ${newPolicy.customerName}`);
    return newPolicy;
  };

  const updatePolicy = async (id, updates) => {
    if (apiMode === 'live_django') {
      try {
        const updated = await djangoUpdatePolicy(id, updates);
        setPolicies((prev) => prev.map((p) => (p.id === id ? updated : p)));
        logApiCall('PATCH', `/api/policies/${id}/`, 200, `Updated policy ${id} in PostgreSQL`);
        return;
      } catch (err) {
        logApiCall('PATCH', `/api/policies/${id}/`, err.response?.status || 500, `Live policy update error: ${err.message}`);
      }
    }

    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    logApiCall('PATCH', `/api/policies/${id}/`, 200, `Updated policy ${id}`);
  };

  // Claims Management
  const submitClaim = async (claimData) => {
    if (apiMode === 'live_django') {
      try {
        const created = await djangoCreateClaim(claimData);
        setClaims((prev) => {
          const next = [created, ...prev];
          try { localStorage.setItem('insuresphere_live_claims', JSON.stringify(next)); } catch {}
          return next;
        });
        logApiCall('POST', '/api/claims/', 201, `Submitted claim ${created.claimNumber} in PostgreSQL`);
        return created;
      } catch (err) {
        logApiCall('POST', '/api/claims/', err.response?.status || 500, `Live claim create error: ${err.message}`);
      }
    }

    const claimNumber = `CLM-2026-${Math.floor(8900 + Math.random() * 999)}`;
    const policy = policies.find((p) => p.id === claimData.policyId) || policies[0];
    const grossAmount = Number(claimData.amount) || 85000;
    const deductible = policy ? policy.deductible : 25000;
    const netEligible = Math.max(0, grossAmount - deductible);
    const cededPct = policy ? policy.cededPercentage : 40;
    const reinsuranceRecovery = Math.round(netEligible * (cededPct / 100));

    const newClaim = {
      id: claimNumber,
      claimNumber,
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      customerId: policy.customerId,
      customerName: policy.customerName,
      type: policy.lineOfBusiness,
      incidentDate: claimData.incidentDate || new Date().toISOString().split('T')[0],
      submittedDate: new Date().toISOString().split('T')[0],
      amount: grossAmount,
      deductible,
      reinsuranceRecovery,
      status: 'Pending Review',
      priority: grossAmount >= 250000 ? 'Critical' : grossAmount >= 100000 ? 'High' : 'Medium',
      assignedAdjuster: 'Marcus Sterling',
      description: claimData.description,
      supportingDocs: claimData.supportingDocs?.length
        ? claimData.supportingDocs
        : [{ name: 'FNOL_Loss_Declaration_Signed.pdf', size: '1.4 MB', uploadedAt: new Date().toISOString().split('T')[0] }],
      activityHistory: [
        {
          id: `ACT-${Date.now()}`,
          timestamp: `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
          actor: `${currentUser.name} (${currentUser.role})`,
          action: `Submitted First Notice of Loss (FNOL) for $${grossAmount.toLocaleString()} under ${policy.policyNumber}.`,
        },
        {
          id: `ACT-${Date.now() + 1}`,
          timestamp: `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
          actor: 'n8n Automated Intake Pipeline',
          action: `Validated policy active dates, calculated $${deductible.toLocaleString()} deductible, and estimated $${reinsuranceRecovery.toLocaleString()} treaty recovery.`,
        },
      ],
    };

    setClaims((prev) => [newClaim, ...prev]);
    logApiCall('POST', '/api/claims/', 201, `Submitted claim ${claimNumber} ($${grossAmount.toLocaleString()})`);
    return newClaim;
  };

  const updateClaimStatus = async (claimId, newStatus, reviewerNote, reviewAction) => {
    let statusVal = newStatus;
    let noteVal = reviewerNote;
    let actionVal = reviewAction;

    if (typeof newStatus === 'object' && newStatus !== null) {
      statusVal = newStatus.status;
      noteVal = newStatus.reviewerNote;
      actionVal = newStatus.action;
    }

    if (!actionVal) {
      if (statusVal === 'Approved') actionVal = 'Approve';
      else if (statusVal === 'Pending Review' || statusVal === 'Hold') actionVal = 'Hold';
      else if (statusVal === 'Rejected') actionVal = 'Reject';
      else actionVal = statusVal;
    }

    // Ensure Hold strictly sets 'Pending Review', never 'Approved'
    if (actionVal === 'Hold' || actionVal === 'hold') {
      statusVal = 'Pending Review';
    }

    if (apiMode === 'live_django') {
      try {
        const payload = {
          action: actionVal,
          status: statusVal,
          reviewerNote: noteVal,
        };
        const updated = await djangoUpdateClaim(claimId, payload);
        setClaims((prev) => {
          const next = prev.map((c) => (c.id === claimId ? updated : c));
          try { localStorage.setItem('insuresphere_live_claims', JSON.stringify(next)); } catch {}
          return next;
        });
        logApiCall('PATCH', `/api/claims/${claimId}/`, 200, `Updated claim ${claimId} (${actionVal}: ${statusVal}) in PostgreSQL`);
        return;
      } catch (err) {
        logApiCall('PATCH', `/api/claims/${claimId}/`, err.response?.status || 500, `Live claim update error: ${err.message}`);
      }
    }

    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== claimId) return c;
        let actionDesc = `Changed status to "${statusVal}".`;
        if (actionVal === 'Approve' || statusVal === 'Approved') {
          actionDesc = 'Approved claim settlement.';
        } else if (actionVal === 'Hold' || statusVal === 'Pending Review') {
          actionDesc = 'Held claim for adjuster inquiry.';
        } else if (actionVal === 'Reject' || statusVal === 'Rejected') {
          actionDesc = 'Rejected claim.';
        }
        const fullAction = noteVal ? `${actionDesc} Note: ${noteVal}` : actionDesc;
        const entry = {
          id: `ACT-${Date.now()}`,
          timestamp: `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
          actor: `${currentUser.name} (${currentUser.role})`,
          action: fullAction,
        };
        return {
          ...c,
          status: statusVal,
          activityHistory: [entry, ...(c.activityHistory || [])],
        };
      })
    );
    logApiCall('PATCH', `/api/claims/${claimId}/`, 200, `Updated claim ${claimId} (${actionVal}: ${statusVal})`);
  };

  // Reinsurance Treaty Management
  const addTreaty = async (treatyData) => {
    if (apiMode === 'live_django') {
      try {
        const created = await djangoCreateTreaty(treatyData);
        setTreaties((prev) => {
          const next = [created, ...prev];
          try { localStorage.setItem('insuresphere_live_treaties', JSON.stringify(next)); } catch {}
          return next;
        });
        logApiCall('POST', '/api/reinsurance/treaties/', 201, `Created treaty ${created.treatyCode} in PostgreSQL`);
        return created;
      } catch (err) {
        logApiCall('POST', '/api/reinsurance/treaties/', err.response?.status || 500, `Live treaty create error: ${err.message}`);
      }
    }

    const treatyCode = `TRT-2026-0${treaties.length + 1}`;
    const cededSharePct = Number(treatyData.cededSharePct) || 45;
    const newTreaty = {
      id: treatyCode,
      treatyCode,
      name: treatyData.name,
      type: treatyData.type || 'Proportional Quota Share',
      reinsurerName: treatyData.reinsurerName,
      spRating: treatyData.spRating || 'AA-',
      cedantRetentionPct: 100 - cededSharePct,
      cededSharePct,
      treatyLimit: Number(treatyData.treatyLimit) || 25000000,
      attachmentPoint: Number(treatyData.attachmentPoint) || 50000,
      cededPremiumYTD: Number(treatyData.cededPremiumYTD) || 450000,
      recoveriesCollectedYTD: 0,
      pendingRecoveries: 0,
      effectiveDate: treatyData.effectiveDate || '2026-01-01',
      expirationDate: treatyData.expirationDate || '2026-12-31',
      status: 'Active',
    };
    setTreaties((prev) => [newTreaty, ...prev]);
    logApiCall('POST', '/api/reinsurance/treaties/', 201, `Created reinsurance treaty ${treatyCode} with ${newTreaty.reinsurerName}`);
    return newTreaty;
  };

  // Computed KPI Metrics for Dashboard
  const dashboardMetrics = useMemo(() => {
    // When connected to Live Django and authenticated as Admin/Agent, prioritize PostgreSQL database aggregations
    if (apiMode === 'live_django' && liveAnalytics) {
      return {
        totalCustomers: Number(liveAnalytics.totalCustomers ?? customers.length),
        activeCustomers: Number(liveAnalytics.activeCustomers ?? customers.filter((c) => c.status === 'Active').length),
        totalPolicies: Number(liveAnalytics.totalPolicies ?? policies.length),
        activePolicies: Number(liveAnalytics.activePolicies ?? policies.filter((p) => p.renewalStatus !== 'Expired').length),
        totalClaims: Number(liveAnalytics.totalClaims ?? claims.length),
        pendingClaims: Number(liveAnalytics.pendingClaims ?? claims.filter((c) => c.status === 'Pending Review' || c.status === 'SIU Investigation').length),
        approvedClaims: Number(liveAnalytics.approvedClaims ?? claims.filter((c) => c.status === 'Approved').length),
        rejectedClaims: Number(liveAnalytics.rejectedClaims ?? claims.filter((c) => c.status === 'Rejected').length),
        totalPremiumRevenue: Number(liveAnalytics.totalPremiumRevenue ?? policies.reduce((sum, p) => sum + (Number(p.annualPremium) || 0), 0)),
        totalClaimsVolume: Number(liveAnalytics.totalClaimsVolume ?? claims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)),
        totalReinsuranceRecoveries: Number(liveAnalytics.totalReinsuranceRecoveries ?? claims
          .filter((c) => c.status === 'Approved')
          .reduce((sum, c) => sum + (Number(c.reinsuranceRecovery) || 0), 0)),
        lossRatio: Number(liveAnalytics.lossRatio ?? 0.0),
        activeTreatiesCount: Number(liveAnalytics.activeTreatiesCount ?? treaties.length),
        portfolioByLob: Array.isArray(liveAnalytics.portfolioByLob) ? liveAnalytics.portfolioByLob : [],
      };
    }

    const totalCustomers = customers.length;
    const activeCustomers = customers.filter((c) => c.status === 'Active').length;
    const activePolicies = policies.filter((p) => p.renewalStatus !== 'Expired').length;
    const totalClaims = claims.length;
    const pendingClaims = claims.filter((c) => c.status === 'Pending Review' || c.status === 'SIU Investigation').length;
    const approvedClaims = claims.filter((c) => c.status === 'Approved').length;
    const rejectedClaims = claims.filter((c) => c.status === 'Rejected').length;
    const totalPremiumRevenue = policies.reduce((sum, p) => sum + (Number(p.annualPremium) || 0), 0);
    const totalClaimsVolume = claims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalReinsuranceRecoveries = claims
      .filter((c) => c.status === 'Approved')
      .reduce((sum, c) => sum + (Number(c.reinsuranceRecovery) || 0), 0);
    const lossRatio = totalPremiumRevenue > 0 ? Number(((totalClaimsVolume / totalPremiumRevenue) * 100).toFixed(2)) : 0.0;

    return {
      totalCustomers,
      activeCustomers,
      totalPolicies: policies.length,
      activePolicies,
      totalClaims,
      pendingClaims,
      approvedClaims,
      rejectedClaims,
      totalPremiumRevenue,
      totalClaimsVolume,
      totalReinsuranceRecoveries,
      lossRatio,
      activeTreatiesCount: treaties.length,
      portfolioByLob: [],
    };
  }, [apiMode, liveAnalytics, customers, policies, claims, treaties]);

  return (
    <AppContext.Provider
      value={{
        apiMode,
        setApiMode,
        djangoUrl,
        updateDjangoBaseUrl,
        djangoStatus,
        isSessionLoading,
        restoreLiveSession,
        logoutLiveDjango,
        testAndSyncDjangoBackend,
        switchToDemoMode,
        users,
        currentUser,
        switchUserRole,
        registerOrLoginCustomUser,
        updateCurrentUserProfile,
        customers,
        addCustomer,
        updateCustomer,
        toggleCustomerStatus,
        deleteCustomer,
        policies,
        addPolicy,
        updatePolicy,
        claims,
        submitClaim,
        updateClaimStatus,
        treaties,
        addTreaty,
        dashboardMetrics,
        apiLogs,
        logApiCall,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
