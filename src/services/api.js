import axios from 'axios';

/**
 * InsureSphere AI — Plain JavaScript Axios REST API Service Layer
 * Supports two strictly separated operational modes:
 * 1. Synthetic Demo Mode (In-memory enterprise dataset for standalone React preview)
 * 2. Live Django DRF API Mode (Real HTTP/JWT requests to Python Django on port 8000)
 */

const getBaseDjangoUrl = () => {
  if (typeof window !== 'undefined') {
    // In browser, route requests through same-origin /api proxy to ensure cookies work seamlessly without cross-site issues
    return '/api';
  }
  return 'http://127.0.0.1:8000/api';
};

const DEFAULT_DJANGO_URL =
  import.meta.env.VITE_DJANGO_API_URL || getBaseDjangoUrl();

export function getStoredDjangoUrl() {
  const stored = localStorage.getItem('insuresphere_django_api_url');
  if (stored) {
    if (stored.includes('localhost:8000/api') || stored.includes('127.0.0.1:8000/api')) {
      return '/api';
    }
    return stored;
  }
  return DEFAULT_DJANGO_URL;
}

export function setStoredDjangoUrl(url) {
  const cleaned = url.trim().replace(/\/+$/, '');
  localStorage.setItem('insuresphere_django_api_url', cleaned);
  djangoApiClient.defaults.baseURL = cleaned.includes('localhost:8000/api') || cleaned.includes('127.0.0.1:8000/api') ? '/api' : cleaned;
}

// Token storage helpers (only short-lived access token in sessionStorage & localStorage; never refresh tokens or passwords in localStorage)
export function getAccessToken() {
  return (
    sessionStorage.getItem('insuresphere_live_jwt_access') ||
    localStorage.getItem('insuresphere_live_jwt_access') ||
    ''
  );
}

export function setAccessToken(token) {
  if (token) {
    sessionStorage.setItem('insuresphere_live_jwt_access', token);
    localStorage.setItem('insuresphere_live_jwt_access', token);
    localStorage.removeItem('insuresphere_live_jwt_refresh'); // Clean up any stale refresh token
  } else {
    sessionStorage.removeItem('insuresphere_live_jwt_access');
    localStorage.removeItem('insuresphere_live_jwt_access');
  }
}

export function clearAuthTokens() {
  sessionStorage.removeItem('insuresphere_live_jwt_access');
  localStorage.removeItem('insuresphere_live_jwt_access');
  localStorage.removeItem('insuresphere_live_jwt_refresh');
}

// Dedicated Axios client for the Python Django REST Framework backend with HttpOnly cookie support
export const djangoApiClient = axios.create({
  baseURL: getStoredDjangoUrl(),
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Attach SimpleJWT Bearer token on every outgoing request to Django DRF
djangoApiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Automatic token refresh interceptor on 401 Unauthorized using HttpOnly cookie or token renewal
djangoApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.url?.includes('/auth/login/') &&
      !originalRequest?.url?.includes('/auth/token/refresh/')
    ) {
      originalRequest._retry = true;
      try {
        const refreshData = await djangoRefreshToken();
        if (refreshData?.access) {
          originalRequest.headers.Authorization = `Bearer ${refreshData.access}`;
          return djangoApiClient(originalRequest);
        }
      } catch (refreshErr) {
        clearAuthTokens();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

// --- Live Django REST Framework API Methods ---

export async function djangoLogin(email, password) {
  clearAuthTokens();
  const response = await djangoApiClient.post('/auth/login/', { email, password });
  if (response.data?.access) {
    setAccessToken(response.data.access);
  }
  // Refresh token is stored in a secure HttpOnly cookie by Django backend
  // We explicitly do NOT store the refresh token in localStorage
  return response.data;
}

export async function djangoRefreshToken() {
  // Uses HttpOnly cookie set by Django (with credentials: true)
  const response = await axios.post(
    `${getStoredDjangoUrl()}/auth/token/refresh/`,
    {},
    {
      withCredentials: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    }
  );
  if (response.data?.access) {
    setAccessToken(response.data.access);
  }
  return response.data;
}

export async function djangoLogout() {
  try {
    await djangoApiClient.post('/auth/logout/', {});
  } catch {
    // Ignore network or token expiration errors on logout
  } finally {
    clearAuthTokens();
  }
  return true;
}

export async function djangoRestoreSession() {
  // 1. Check if existing access token is still valid
  const currentToken = getAccessToken();
  if (currentToken) {
    try {
      const user = await djangoFetchCurrentUser();
      return { success: true, user, source: 'cached_token' };
    } catch {
      // Access token expired, attempt refresh
    }
  }

  // 2. Attempt token refresh using HttpOnly cookie
  try {
    const refreshData = await djangoRefreshToken();
    if (refreshData?.access) {
      const user = await djangoFetchCurrentUser();
      return { success: true, user, source: 'cookie_refresh' };
    }
  } catch (err) {
    clearAuthTokens();
    return { success: false, error: err };
  }

  return { success: false, error: new Error('No active live session found') };
}

export async function djangoHealthCheck() {
  const response = await djangoApiClient.get('/health/');
  return response.data;
}

export async function djangoFetchCurrentUser() {
  const response = await djangoApiClient.get('/auth/me/');
  return response.data;
}

export async function djangoRegister(payload) {
  clearAuthTokens();
  const response = await djangoApiClient.post('/auth/register/', payload);
  if (response.data?.access) {
    setAccessToken(response.data.access);
  }
  return response.data;
}

export async function djangoFetchCustomers(params = {}) {
  const response = await djangoApiClient.get('/customers/', { params });
  return response.data?.results || response.data;
}

export async function djangoCreateCustomer(payload) {
  const response = await djangoApiClient.post('/customers/', payload);
  return response.data;
}

export async function djangoUpdateCustomer(customerCode, payload) {
  const response = await djangoApiClient.patch(`/customers/${customerCode}/`, payload);
  return response.data;
}

export async function djangoToggleCustomerStatus(customerCode) {
  const response = await djangoApiClient.post(`/customers/${customerCode}/toggle-status/`);
  return response.data;
}

export async function djangoDeleteCustomer(customerCode) {
  await djangoApiClient.delete(`/customers/${customerCode}/`);
  return true;
}

export async function djangoFetchPolicies(params = {}) {
  const response = await djangoApiClient.get('/policies/', { params });
  return response.data?.results || response.data;
}

export function normalizeDjangoPolicy(policy) {
  if (!policy || typeof policy !== 'object') return policy;

  const normalizeRequiredNumber = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  };
  const coverageLimit = normalizeRequiredNumber(policy.coverageLimit);
  const deductible = normalizeRequiredNumber(policy.deductible);
  const annualPremium = normalizeRequiredNumber(policy.annualPremium);

  return {
    ...policy,
    id: policy.id || policy.policyNumber,
    policyNumber: policy.policyNumber || policy.id,
    coverageLimit,
    deductible,
    annualPremium,
  };
}

export async function djangoCreatePolicy(payload) {
  const customerId =
    payload.customerId ||
    payload.customer_code ||
    payload.customerCode ||
    '';
  const reinsuranceTreatyId =
    payload.reinsuranceTreatyId ||
    payload.treatyCode ||
    payload.treaty_code ||
    '';
  const response = await djangoApiClient.post('/policies/', {
    title: payload.title,
    customerId,
    lineOfBusiness: payload.lineOfBusiness,
    coverageLimit: Number(payload.coverageLimit),
    deductible: Number(payload.deductible),
    annualPremium: Number(payload.annualPremium),
    paymentFrequency: payload.paymentFrequency || 'Annual',
    effectiveDate: payload.effectiveDate,
    expirationDate: payload.expirationDate,
    reinsuranceTreatyId,
    coverageSummary: payload.coverageSummary,
    exclusions: payload.exclusions || '',
  });
  return normalizeDjangoPolicy(response.data);
}

export async function djangoUpdatePolicy(policyNumber, payload) {
  const response = await djangoApiClient.patch(`/policies/${policyNumber}/`, payload);
  return response.data;
}

export async function djangoFetchClaims(params = {}) {
  const response = await djangoApiClient.get('/claims/', { params });
  return response.data?.results || response.data;
}

export async function djangoCreateClaim(payload) {
  const response = await djangoApiClient.post('/claims/', payload);
  return response.data;
}

export async function djangoUpdateClaim(claimNumber, payload) {
  const response = await djangoApiClient.patch(`/claims/${claimNumber}/`, payload);
  return response.data;
}

export async function djangoFetchTreaties() {
  const response = await djangoApiClient.get('/reinsurance/treaties/');
  return response.data?.results || response.data;
}

export async function djangoCreateTreaty(payload) {
  const response = await djangoApiClient.post('/reinsurance/treaties/', payload);
  return response.data;
}

export async function djangoFetchAnalytics(params = {}) {
  const query = {};
  if (params?.startDate) query.start_date = params.startDate;
  if (params?.endDate) query.end_date = params.endDate;
  const config = Object.keys(query).length > 0 ? { params: query } : undefined;
  const response = await djangoApiClient.get('/dashboard/analytics/', config);
  return response.data;
}

/**
 * Generates deterministic actuarial & RAG advisory output when running in
 * standalone Synthetic Demo Mode (before the Python Django backend is connected).
 */
function buildSyntheticAdvisory(mode, documentText, question, claimContext, policyContext) {
  if (mode === 'claim_analysis' && claimContext) {
    const amount = Number(claimContext.amount || 125000);
    const deductible = Number(policyContext?.deductible || claimContext.deductible || 25000);
    const netPayable = Math.max(0, amount - deductible);
    return {
      summary: `Advisory review for Claim ${claimContext.claimNumber || 'CLM-2026-8841'} (${claimContext.type || 'Commercial Property'}) filed by ${claimContext.customerName || 'Insured Entity'}. Reported gross loss of $${amount.toLocaleString()} falls within the active policy period.`,
      coverageAssessment: `Policy ${claimContext.policyNumber || 'POL-COM-9012'} carries a $${deductible.toLocaleString()} per-occurrence deductible. Preliminary net eligible loss before depreciation is $${netPayable.toLocaleString()}, within the aggregate policy limit.`,
      riskIndicators: [
        'Incident timestamp is within 48 hours of severe weather/operational log entry; corroborate third-party surveyor report.',
        'Verify original commercial invoice line items against repair contractor estimates to rule out betterment.',
        'Confirm no overlapping coverage exists under marine inland transit endorsements.',
      ],
      reinsuranceImpact:
        amount > 100000
          ? `Loss exceeds $100,000 Quota Share / Surplus notification threshold. Estimated 40% reinsurance cession ($${Math.round(netPayable * 0.4).toLocaleString()}) recoverable from Swiss Re / Munich Re Treaty Panel.`
          : 'Loss remains within primary cedant retention layer; no facultative or excess-of-loss recovery triggered.',
      humanReviewerChecklist: [
        'Inspect signed proof-of-loss affidavit and independent adjuster field photographs.',
        'Verify policyholder premium account has zero overdue installments as of the loss date.',
        'Record formal human adjuster determination (Approve / Hold for Inquiry / Reject) in the audit log.',
      ],
    };
  }

  if (mode === 'explain_terms') {
    return {
      summary:
        'In plain language, this clause defines how financial responsibility is shared between the insurer and the policyholder when a covered loss occurs, and establishes the insurerâ€™s right to recover paid funds from negligent third parties.',
      coverageAssessment:
        'Covers direct physical loss or legal liability specified in the declarations schedule, subject to the stated per-occurrence deductible and co-insurance maintenance percentage.',
      riskIndicators: [
        'Late notification beyond the 30-day reporting window may prejudice recovery rights.',
        'Policyholder must maintain insured asset values at least at 80% of replacement cost to avoid co-insurance penalties.',
      ],
      reinsuranceImpact:
        'Subrogation recoveries collected after claim settlement are credited proportionally back to participating treaty reinsurers.',
      humanReviewerChecklist: [
        'Confirm the insured understands the per-occurrence deductible vs. annual aggregate cap.',
        'Verify any scheduled endorsements modifying standard subrogation waivers.',
      ],
    };
  }

  return {
    summary: question
      ? `RAG Retrieval Answer for "${question}": Under Section 4.2 (Insuring Agreement & Exclusions), coverage responds to sudden and accidental loss events reported within 30 calendar days, subject to policy retention and treaty cession terms.`
      : 'Document Summary: This commercial insurance wording establishes primary coverage limits, deductible obligations, cyber & property sub-limits, and proportional quota-share reinsurance cession triggers.',
    coverageAssessment:
      'Primary limit up to $15,000,000 per occurrence with a $50,000 standard commercial deductible. Business interruption waiting period is 72 hours.',
    riskIndicators: [
      'Clause 7.4 excludes pre-existing mechanical breakdown and unpatched zero-day software vulnerabilities known prior to inception.',
      'Requires quarterly risk engineering inspection certificates for warehouse fire suppression systems.',
    ],
    reinsuranceImpact:
      'Covered under 2026 Commercial Quota Share Treaty (60% Retained / 40% Ceded across Swiss Re and Hannover Re panels).',
    humanReviewerChecklist: [
      'Cross-check endorsement schedule END-04 against customer risk profile.',
      'Ensure underwriter sign-off before issuing binding policy certificate.',
    ],
  };
}

/**
 * Calls the AI Document & Claim Analysis endpoint.
 * In Live Django Mode, routes to Django's `POST /api/ai/analyze-document/`.
 * In Demo Mode, returns structured synthetic advisory output without requiring a Node.js backend.
 */
export async function analyzeInsuranceDocument({
  mode,
  documentText,
  question,
  claimContext,
  policyContext,
  useLiveDjango = false,
}) {
  if (useLiveDjango) {
    const response = await djangoApiClient.post('/ai/analyze-document/', {
      mode,
      documentText,
      question,
      claimContext,
      policyContext,
    });
    return response.data;
  }

  return {
    source: 'synthetic-demo-rag-engine',
    disclaimer:
      'Human-in-the-Loop Advisory Only: Final claim & underwriting decisions require licensed adjuster authorization.',
    analysis: buildSyntheticAdvisory(mode, documentText, question, claimContext, policyContext),
  };
}

export const DRF_ENDPOINT_CATALOG = [
  {
    method: 'POST',
    endpoint: '/api/auth/login/',
    viewClass: 'InsureSphereLoginView (SimpleJWT)',
    permission: 'AllowAny',
    description: 'Authenticates user credentials and returns access + refresh JWT tokens with organization & role claims.',
  },
  {
    method: 'POST',
    endpoint: '/api/auth/register/',
    viewClass: 'UserRegistrationAPIView',
    permission: 'AllowAny',
    description: 'Registers a new user in PostgreSQL, assigns Organization tenant, and issues initial JWT pair.',
  },
  {
    method: 'GET / PATCH',
    endpoint: '/api/auth/me/',
    viewClass: 'UserProfileAPIView',
    permission: 'IsAuthenticated',
    description: 'Retrieves or updates the authenticated user profile and regulatory license metadata.',
  },
  {
    method: 'GET',
    endpoint: '/api/customers/',
    viewClass: 'CustomerViewSet.list',
    permission: 'IsOrganizationMember & IsAdminOrAgentRole',
    description: 'Paginated, organization-isolated queryset of customers with PostgreSQL policy count & premium annotations.',
  },
  {
    method: 'POST',
    endpoint: '/api/customers/',
    viewClass: 'CustomerViewSet.create',
    permission: 'IsOrganizationMember & IsAdminOrAgentRole',
    description: 'Validates KYC metadata and risk score (1-100) via CustomerSerializer and creates a PostgreSQL record.',
  },
  {
    method: 'GET / POST',
    endpoint: '/api/policies/',
    viewClass: 'PolicyViewSet',
    permission: 'IsOrganizationMember & IsAdminOrAgentRole',
    description: 'Lists and binds insurance policies with select_related("customer", "reinsurance_treaty").',
  },
  {
    method: 'GET / POST',
    endpoint: '/api/claims/',
    viewClass: 'ClaimViewSet',
    permission: 'IsAuthenticated & IsOrganizationMember',
    description: 'Submits First Notice of Loss (FNOL), calculates net deductible & treaty recovery, and records audit logs.',
  },
  {
    method: 'PATCH',
    endpoint: '/api/claims/{claim_number}/',
    viewClass: 'ClaimViewSet.partial_update',
    permission: 'IsOrganizationMember & (Admin | Agent)',
    description: 'Enforces human adjuster role check before updating claim status and appending ClaimActivityLog.',
  },
  {
    method: 'GET / POST',
    endpoint: '/api/reinsurance/treaties/',
    viewClass: 'ReinsuranceTreatyViewSet',
    permission: 'IsOrganizationMember & IsAdminOrAgentRole',
    description: 'Manages Quota Share, Surplus, and XoL reinsurance treaties and calculates cession recoveries.',
  },
  {
    method: 'GET',
    endpoint: '/api/dashboard/analytics/',
    viewClass: 'DashboardAnalyticsAPIView',
    permission: 'IsAuthenticated',
    description: 'Aggregates Gross Written Premium, Claims Incurred, and Reinsurance Recoveries via PostgreSQL Sum/Count.',
  },
  {
    method: 'POST',
    endpoint: '/api/ai/analyze-document/',
    viewClass: 'AIDocumentAnalysisAPIView',
    permission: 'IsAuthenticated',
    description: 'Executes Google Gemini RAG & Claims Advisory pipeline (human-in-the-loop decision support).',
  },
];
