import React, { useState } from 'react';
import {
  Server,
  Database,
  Layers,
  Workflow,
  Terminal,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/useApp.js';
import { DRF_ENDPOINT_CATALOG } from '../services/api.js';

const DJANGO_CODE_FILES = [
  {
    path: 'backend_django/insuresphere_core/settings.py',
    title: 'settings.py (PostgreSQL + DRF + SimpleJWT)',
    description: 'Configures the 7 domain apps, PostgreSQL connection pooling, custom User model, and SimpleJWT tokens.',
    code: `INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    # InsureSphere AI 7 Modular Domain Apps
    'accounts',
    'customers',
    'policies',
    'claims',
    'reinsurance',
    'analytics',
    'ai_assistant',
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'insuresphere_db'),
        'USER': os.getenv('DB_USER', 'insuresphere_user'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'strong_postgres_password'),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'ATOMIC_REQUESTS': True,
    }
}

AUTH_USER_MODEL = 'accounts.User'`,
  },
  {
    path: 'backend_django/accounts/models.py',
    title: 'accounts/models.py (Organization & Custom RBAC User)',
    description: 'Multi-tenant Organization isolation and UUID-based User model with Admin, Agent, and Customer roles.',
    code: `class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    naic_company_code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)

class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = 'Admin', 'System Administrator / CUO'
        AGENT = 'Agent', 'Licensed Insurance Agent / Adjuster'
        CUSTOMER = 'Customer', 'Policyholder Representative'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name='users', null=True)
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)`,
  },
  {
    path: 'backend_django/customers/models.py',
    title: 'customers/models.py (Customer ORM & Constraints)',
    description: 'PostgreSQL CheckConstraint on actuarial risk_score (1-100) and UniqueConstraint per organization email.',
    code: `class Customer(models.Model):
    customer_code = models.CharField(max_length=24, unique=True, db_index=True)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='customers')
    name = models.CharField(max_length=200, db_index=True)
    contact_person = models.CharField(max_length=150)
    email = models.EmailField(db_index=True)
    account_type = models.CharField(max_length=20, default='Corporate')
    industry = models.CharField(max_length=120)
    risk_tier = models.CharField(max_length=30, default='Low Risk')
    risk_score = models.PositiveSmallIntegerField(
        default=30,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    status = models.CharField(max_length=20, default='Active', db_index=True)

    class Meta:
        db_table = 'customers_customer'
        constraints = [
            models.CheckConstraint(
                check=models.Q(risk_score__gte=1) & models.Q(risk_score__lte=100),
                name='customer_risk_score_between_1_and_100',
            ),
            models.UniqueConstraint(
                fields=['organization', 'email'],
                name='unique_customer_email_per_organization',
            ),
        ]`,
  },
  {
    path: 'backend_django/customers/views.py',
    title: 'customers/views.py (CustomerViewSet + Annotations)',
    description: 'Eliminates N+1 queries with Count/Sum annotations and enforces organization-level queryset isolation.',
    code: `class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = (IsOrganizationMember, IsAdminOrAgentRole)
    lookup_field = 'customer_code'
    filterset_fields = ('account_type', 'risk_tier', 'status')
    search_fields = ('customer_code', 'name', 'contact_person', 'email', 'industry')

    def get_queryset(self):
        queryset = Customer.objects.annotate(
            annotated_policy_count=Count(
                'policies',
                filter=~Q(policies__renewal_status='Expired'),
                distinct=True,
            ),
            annotated_total_premium=Sum('policies__annual_premium'),
        )
        user = self.request.user
        if user.is_authenticated and user.organization_id:
            queryset = queryset.filter(organization_id=user.organization_id)
        return queryset`,
  },
];

export default function ArchitectureBlueprint() {
  const {
    apiLogs,
    apiMode,
    djangoUrl,
    updateDjangoBaseUrl,
    djangoStatus,
    testAndSyncDjangoBackend,
    switchToDemoMode,
    logoutLiveDjango,
    currentUser,
  } = useApp();

  const [selectedCodeFile, setSelectedCodeFile] = useState(DJANGO_CODE_FILES[0]);
  const [urlInput, setUrlInput] = useState(djangoUrl);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const postgresTables = [
    {
      table: 'accounts_organization',
      pk: 'id (UUID)',
      fields: 'name, slug, naic_company_code, domicile_country, is_active',
      relations: '1:N -> accounts_user, customers_customer, policies_policy, claims_claim, reinsurance_treaty',
    },
    {
      table: 'accounts_user',
      pk: 'id (UUID)',
      fields: 'organization_id (FK), email, password, role (Admin|Agent|Customer), title, license_number',
      relations: 'N:1 -> accounts_organization, 1:N -> policies_policy, 1:N -> claims_claim',
    },
    {
      table: 'customers_customer',
      pk: 'id (BIGINT) / customer_code',
      fields: 'organization_id (FK), customer_code, name, contact_person, email, account_type, risk_tier, risk_score',
      relations: 'N:1 -> accounts_organization, 1:N -> policies_policy',
    },
    {
      table: 'reinsurance_treaty',
      pk: 'id (BIGINT) / treaty_code',
      fields: 'organization_id (FK), treaty_code, name, treaty_type, reinsurer_name, cedant_retention_pct, ceded_share_pct',
      relations: 'N:1 -> accounts_organization, 1:N -> policies_policy',
    },
    {
      table: 'policies_policy',
      pk: 'id (BIGINT) / policy_number',
      fields: 'organization_id (FK), customer_id (FK), reinsurance_treaty_id (FK), coverage_limit, deductible, annual_premium',
      relations: 'N:1 -> customers_customer, N:1 -> reinsurance_treaty, 1:N -> claims_claim',
    },
    {
      table: 'claims_claim',
      pk: 'id (BIGINT) / claim_number',
      fields: 'organization_id (FK), policy_id (FK), incident_date, gross_amount, deductible, reinsurance_recovery, status',
      relations: 'N:1 -> policies_policy, 1:N -> claims_supportingdocument, 1:N -> claims_claimactivitylog',
    },
  ];

  const handleTestLiveConnection = async (e) => {
    e.preventDefault();
    updateDjangoBaseUrl(urlInput);
    await testAndSyncDjangoBackend({ email: emailInput, password: passwordInput });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="text-xs text-slate-500">
          Phase 2 Full-Stack Architecture · Python Django 5.1 + DRF + SimpleJWT + PostgreSQL (`/django_backend/`)
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Django REST Framework (DRF) Backend, Live API Mode &amp; PostgreSQL Schema
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          All Phase 2 Python Django source files are served from `/django_backend/`. Keep Synthetic Demo Mode separate from Live Django Mode below.
        </p>
      </div>

      {/* Mode Switcher: Demo Mode vs Live Django REST API Mode */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-blue-700">
              React ↔ Django REST API Connection Controller
            </div>
            <h2 className="mt-0.5 font-display text-base font-bold text-slate-900">
              Active Data Source: {apiMode === 'live_django' ? 'Live Django DRF + PostgreSQL' : 'Phase 1 Synthetic Demo Mode'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={switchToDemoMode}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                apiMode === 'demo'
                  ? 'bg-[#0f172a] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Use Synthetic Demo Mode
            </button>
            {apiMode === 'live_django' && djangoStatus.state === 'connected' && (
              <button
                type="button"
                onClick={logoutLiveDjango}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition-colors"
              >
                Log Out Live Session
              </button>
            )}
            <button
              type="button"
              onClick={handleTestLiveConnection}
              disabled={djangoStatus.state === 'testing'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                apiMode === 'live_django'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${djangoStatus.state === 'testing' ? 'animate-spin' : ''}`} />
              {djangoStatus.state === 'testing'
                ? 'Testing Django Server...'
                : apiMode === 'live_django'
                ? 'Re-Sync Live Django'
                : 'Test & Connect Live Django API'}
            </button>
          </div>
        </div>

        <form onSubmit={handleTestLiveConnection} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Django API Base URL:
          </label>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://127.0.0.1:8000/api"
            className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono-num text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Django account email"
            autoComplete="username"
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Django password"
            autoComplete="current-password"
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </form>

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {djangoStatus.state === 'connected' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          )}
          <span>{djangoStatus.message}</span>
        </div>
      </div>

      {/* Phase 2 Generated Django Source Code Explorer */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-blue-700" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Python Django Source Code (`/django_backend/`)
            </h2>
          </div>
          <span className="font-mono-num text-xs text-slate-500">
            Django 5.1 · djangorestframework 3.15 · SimpleJWT 5.4 · psycopg 3.2
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200 p-3 lg:col-span-4 space-y-1.5 bg-slate-50/60">
            {DJANGO_CODE_FILES.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedCodeFile(file)}
                className={`w-full rounded-lg p-3 text-left text-xs transition-colors ${
                  selectedCodeFile.path === file.path
                    ? 'bg-[#0f172a] text-white'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <div className="font-semibold">{file.title}</div>
                <div className="mt-0.5 font-mono-num text-[11px] opacity-80 truncate">
                  {file.path}
                </div>
              </button>
            ))}
          </div>

          <div className="p-5 lg:col-span-8 bg-[#0f172a] text-slate-100 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <span className="font-mono-num text-blue-400">{selectedCodeFile.path}</span>
              <span className="text-slate-400">{selectedCodeFile.description}</span>
            </div>
            <pre className="overflow-x-auto font-mono-num text-xs leading-relaxed text-slate-200">
              {selectedCodeFile.code}
            </pre>
          </div>
        </div>
      </div>

      {/* DRF REST API Contract Catalog */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-base font-bold text-slate-900">
            Django REST Framework (DRF) API Endpoint Specification
          </h2>
          <p className="text-xs text-slate-500">
            Exact URL routes, ViewSet handlers, and permission classes mapped to the React frontend
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600">
                <th className="py-3 px-4">HTTP Method</th>
                <th className="py-3 px-4">REST Endpoint</th>
                <th className="py-3 px-4">Django ViewSet / APIView</th>
                <th className="py-3 px-4">DRF Permission Class</th>
                <th className="py-3 px-4">Responsibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {DRF_ENDPOINT_CATALOG.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono-num font-bold text-blue-700 whitespace-nowrap">
                    {item.method}
                  </td>
                  <td className="py-3 px-4 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                    {item.endpoint}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-slate-700 whitespace-nowrap">
                    {item.viewClass}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-slate-600 whitespace-nowrap">
                    {item.permission}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PostgreSQL Relational Schema + Live Session REST Activity Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-display text-base font-bold text-slate-900">
              PostgreSQL Database Schema &amp; Multi-Tenant Foreign Keys
            </h2>
            <p className="text-xs text-slate-500">
              Implemented across `/backend_django/` models with `CheckConstraint` &amp; `UniqueConstraint`
            </p>
          </div>

          <div className="divide-y divide-slate-200 text-xs">
            {postgresTables.map((t) => (
              <div key={t.table} className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono-num font-bold text-slate-900">{t.table}</span>
                  <span className="font-mono-num text-blue-700">PK: {t.pk}</span>
                </div>
                <div className="text-slate-600">
                  <strong>Columns:</strong> <span className="font-mono-num">{t.fields}</span>
                </div>
                <div className="text-slate-500">
                  <strong>Relationships:</strong> {t.relations}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Session REST Dispatch Log */}
        <div className="rounded-xl border border-slate-200 bg-[#0f172a] text-slate-200 p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <Terminal className="h-4 w-4" />
                <span>Interactive Session API Dispatch Log</span>
              </div>
              <span className="font-mono-num text-xs text-slate-400">
                {apiLogs.length} events
              </span>
            </div>

            <div className="mt-4 space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {apiLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 text-xs font-mono-num"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span>
                      <strong className="text-blue-400">{log.method}</strong> {log.endpoint}
                    </span>
                    <span className="text-emerald-400">HTTP {log.status} · {log.timestamp}</span>
                  </div>
                  <div className="mt-1 font-sans-body text-slate-300">{log.summary}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-400">
            Logs both Synthetic Demo dispatches and Live Django DRF requests with HTTP status codes.
          </div>
        </div>
      </div>
    </div>
  );
}
