# InsureSphere AI

**Enterprise Insurance & Reinsurance SaaS Platform** — full-stack portfolio flagship project

InsureSphere AI is an enterprise-style insurance and reinsurance platform for commercial lines: customer management, policy underwriting, claims handling with mandatory human review, proportional reinsurance treaty management with an actuarial risk-sharing calculator, executive analytics, and an AI Policy & RAG Studio grounded in your own uploaded documents.

AI output in this product is **advisory only**. Licensed human adjusters and underwriters retain authority over every claims and underwriting decision — the AI never makes a final decision.

---

## Features

| Area | What it does |
|---|---|
| Executive Dashboard | Portfolio KPIs (customers, policies, claims by status, premium, loss ratio, line-of-business breakdown) from authenticated PostgreSQL-backed APIs, with date filtering and organization-scoped reporting |
| Customer Management | Organization-isolated customer records with KYC status, risk tier/score, and premium totals |
| Policy Underwriting | Policy issuance bound to a customer and a reinsurance treaty, with coverage limits, deductibles, and premiums |
| Claims Management | First Notice of Loss (FNOL) submission, deductible & treaty-recovery calculation, and a human review workflow (Approve / Hold / Reject) with a full audit/activity log |
| Reinsurance Treaties | Quota Share, Surplus Share, and Excess-of-Loss treaty management plus an actuarial cession calculator |
| AI Policy & RAG Studio | Document Q&A, plain-language clause explanations, AI-assisted claims analysis, and a Knowledge Base that answers **only** from uploaded documents, with citations |
| Authentication & RBAC | JWT authentication (SimpleJWT) with Admin / Agent / Customer roles and strict organization (tenant) isolation |

The React frontend runs in two strictly separated modes:

- **Demo Mode** — an in-memory synthetic dataset for standalone preview. Demo charts and AI answers are clearly synthetic.
- **Live Django Mode** (`live_django`) — real HTTP/JWT calls to the Django REST API and PostgreSQL. Live mode never falls back to demo data: if the API does not provide a series (for example a monthly trend), the UI says so instead of rendering fake data.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python, Django 5.1, Django REST Framework 3.15 |
| Auth | djangorestframework-simplejwt (JWT access token + HttpOnly refresh cookie, rotation & blacklist) |
| Database | PostgreSQL (via `psycopg` 3); SQLite supported as a test/local override |
| AI | Google Gemini (`google-genai` SDK), called **server-side only** through Django, with a deterministic actuarial fallback and an extractive RAG fallback |
| Frontend | React 19, Vite 8, React Router, Axios, Recharts, Tailwind CSS 4 |
| Testing | Django test runner (backend), Vitest + Testing Library (frontend) |
| Serving | Gunicorn (backend production), Vite build (frontend static production build) |

---

## Folder Structure

```text
insuresphere-ai/
├── django_backend/            # ★ THE backend — use this one
│   ├── insuresphere_core/     # Django project settings, root URLs, health check
│   ├── accounts/              # Users, organizations, JWT auth, seed_insuresphere command
│   ├── customers/             # Customer ViewSet (org-isolated)
│   ├── policies/              # Policy ViewSet
│   ├── claims/                # Claim ViewSet, human review actions, activity audit log
│   ├── reinsurance/           # Treaty ViewSet + calculate-cession actuarial action
│   ├── analytics/             # Executive dashboard analytics API
│   ├── ai_assistant/          # AI analysis + RAG document ingestion / retrieval / ask
│   ├── .env.example           # Copy to .env — see Environment Variables below
│   ├── requirements.txt
│   └── manage.py
├── backend_django/            # Legacy duplicate backend, kept for project history only.
│                              # ⚠️ Do NOT use, run, or modify it. django_backend/ is canonical.
├── src/
│   ├── pages/                 # Dashboard, Customers, Policies, Claims, Reinsurance,
│   │                          # Analytics, AI Assistant (RAG Studio), Auth, Architecture
│   ├── services/api.js        # Axios service layer: demo engine + Live Django client
│   ├── context/               # AppContext — mode switching, session restore, live sync
│   └── data/mockData.js       # Synthetic demo dataset (Demo Mode only)
├── docs/
│   └── DEPLOYMENT.md          # Production deployment guide & checklist
├── vite.config.js             # Dev server on :3000, proxies /api → http://127.0.0.1:8000
└── package.json
```

---

## System Architecture

```text
React 19 SPA (Vite, :3000)
  │  Axios djangoApiClient — Bearer access token on every request,
  │  withCredentials for the HttpOnly refresh cookie, 401 → refresh → retry
  │  Dev: same-origin /api proxy → Django. Prod: VITE_DJANGO_API_URL.
  ▼
Django 5.1 + DRF API (:8000, /api/…)
  ├── accounts      JWT login / register / refresh (rotated, blacklisted) / logout / me
  ├── customers ─┐
  ├── policies   ├─ every queryset is filtered by request.user.organization
  ├── claims     │  → organization isolation & cross-tenant prevention
  ├── reinsurance┘
  ├── analytics    PostgreSQL Count/Sum aggregates, Admin/Agent only
  └── ai_assistant Gemini (server-side) + RAG over PostgreSQL-stored document chunks
  ▼
PostgreSQL — users, organizations, customers, policies, claims, audit logs,
             treaties, RAG documents & chunks (all organization-scoped)
```

**Organization isolation is enforced in the backend, not the UI.** Every list/retrieve/update queryset is scoped to the authenticated user's organization, so a user in one organization cannot read or mutate another organization's customers, policies, claims, treaties, analytics, or RAG documents.

---

## Local Setup

### Prerequisites

- Python 3.11+ and PostgreSQL 14+ (for the full Live setup)
- Node.js 20+ and npm

### 1. Backend (Django + PostgreSQL)

```bash
cd django_backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then edit .env — see Environment Variables
python manage.py migrate
python manage.py seed_insuresphere # demo dataset + demo login (local dev only!)
python manage.py runserver         # http://127.0.0.1:8000
```

Health check: `GET http://127.0.0.1:8000/api/health/` → `{"status": "ok"}`

**Demo login (seeded, local development only — never deploy these credentials):**

| Field | Value |
|---|---|
| Email | `elena.vance@insuresphere.ai` |
| Password | `InsureSphere2026!` |
| Role | Admin |

### 2. Frontend (React + Vite)

```bash
# from the repository root, in a second terminal
npm install
npm run dev                        # http://localhost:3000
```

The Vite dev server runs on **port 3000** and proxies `/api` to `http://127.0.0.1:8000`, so the browser talks to Django same-origin and the HttpOnly refresh cookie works without cross-site issues. Sign in with the demo login above in **Live Django Mode**, or switch to Demo Mode to explore the synthetic dataset without a backend.

---

## Environment Variables

Backend variables live in `django_backend/.env` (copy `django_backend/.env.example`). **Never commit a real `.env`.**

| Variable | Example / default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | `replace-with-a-secure-50-char-…` | Django secret key; also the JWT signing key. Must be strong and unique in production |
| `DJANGO_DEBUG` | `True` (local) / `False` (production) | Debug mode. **Must be `False` in production** |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated allowed hosts |
| `DB_ENGINE` | `django.db.backends.postgresql` | Database backend. Use `django.db.backends.sqlite3` only as a test/local override |
| `DB_NAME` | `insuresphere_db` | Database name (or SQLite file path when using the SQLite override) |
| `DB_USER` | `insuresphere_user` | Database user |
| `DB_PASSWORD` | *(set locally, never commit)* | Database password |
| `DB_HOST` | `127.0.0.1` | Database host |
| `DB_PORT` | `5432` | Database port |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Origins allowed to call the API with credentials |
| `GEMINI_API_KEY` | *(server-side only)* | Google Gemini key used by Django for AI/RAG generation. Never expose it to the frontend |
| `N8N_CLAIMS_WEBHOOK_URL` | `http://localhost:5678/webhook/insuresphere-fnol` | Optional n8n webhook for automated claims-triage alerts |
| `VITE_DJANGO_API_URL` | *(unset locally)* | Frontend only: absolute Django API base URL for deployed builds. Locally unset, so the `/api` dev proxy is used |

---

## Database Setup

### PostgreSQL (normal setup)

```sql
CREATE DATABASE insuresphere_db;
CREATE USER insuresphere_user WITH PASSWORD 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE insuresphere_db TO insuresphere_user;
```

Then set the matching `DB_*` values in `django_backend/.env` and run `python manage.py migrate`.

### SQLite override (tests & quick local checks only)

For the automated test suite — or a quick smoke run without PostgreSQL — override the engine:

```bash
DB_ENGINE=django.db.backends.sqlite3 DB_NAME=db.sqlite3 python manage.py test
```

SQLite is a test convenience only. Production and normal local development use PostgreSQL.

---

## API Endpoints

All endpoints are under `/api/` and, except login/register/health, require a valid JWT access token. Every data endpoint is organization-scoped.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check → `{"status": "ok"}` (public) |
| `POST` | `/api/auth/login/` | Login; returns access token, sets HttpOnly refresh cookie |
| `POST` | `/api/auth/register/` | Register a user in an organization; issues initial token pair |
| `POST` | `/api/auth/token/refresh/` | Rotate refresh token (old token blacklisted); returns new access token |
| `POST` | `/api/auth/logout/` | Logout; blacklists the refresh token and clears the cookie |
| `GET / PATCH` | `/api/auth/me/` | Current user profile, role, and organization |
| `GET / POST` | `/api/customers/` | List (paginated, org-isolated) / create customers |
| `GET / PATCH / DELETE` | `/api/customers/{customer_code}/` | Retrieve / update / delete a customer |
| `POST` | `/api/customers/{customer_code}/toggle-status/` | Activate / deactivate a customer |
| `GET / POST` | `/api/policies/` | List / issue policies (bound to customer + treaty) |
| `GET / PATCH` | `/api/policies/{policy_number}/` | Retrieve / update a policy |
| `GET / POST` | `/api/claims/` | List claims / submit FNOL (deductible & estimated recovery calculated server-side) |
| `PATCH` | `/api/claims/{claim_number}/` | **Human review / recovery action** — send `action: Approve \| Hold \| Reject` (+ `reviewerNote`). Hold always keeps the claim in `Pending Review`; approval creates an *approved (estimated)* recovery, not a payment |
| `GET / POST` | `/api/reinsurance/treaties/` | List / create reinsurance treaties |
| `POST` | `/api/reinsurance/treaties/{treaty_code}/calculate-cession/` | Actuarial calculator: given gross loss + deductible, returns net eligible loss, retained loss, and estimated ceded recovery for that treaty |
| `GET` | `/api/dashboard/analytics/` | Executive KPIs + `portfolioByLob` (Admin/Agent only). Supports `?start_date=` / `?end_date=` filtering |
| `POST` | `/api/ai/analyze-document/` | AI advisory: `rag_qa`, `explain_terms`, or `claim_analysis` modes (Gemini when configured, deterministic fallback otherwise) |
| `GET / POST` | `/api/ai/documents/` | List organization RAG documents / upload a document (multipart: PDF, DOCX, TXT, MD) for ingestion & chunking |
| `DELETE` | `/api/ai/documents/{id}/` | Delete an organization RAG document and its chunks |
| `POST` | `/api/ai/ask/` | Grounded RAG question over uploaded documents → answer + citations + `source` (see AI/RAG below) |

---

## Authentication Workflow

1. **Login** — `POST /api/auth/login/` with email + password. Django returns a short-lived **access token** in the JSON body and sets the **refresh token as an HttpOnly cookie** (JavaScript cannot read it).
2. **API calls** — the frontend stores only the access token and sends it as `Authorization: Bearer <token>` on every request via the Axios `djangoApiClient` interceptor.
3. **Refresh** — on a `401`, the client calls `POST /api/auth/token/refresh/` (cookie sent automatically). The backend **rotates** the refresh token and **blacklists** the old one, returns a new access token, and the original request is retried once.
4. **Session restore** — on page reload / browser refresh, the app first validates the stored access token (`GET /api/auth/me/`), then falls back to the cookie refresh flow. If neither works in Live mode, the app shows “Authentication Required” — it does **not** silently substitute demo data.
5. **Logout** — `POST /api/auth/logout/` blacklists the refresh token, clears the cookie, and the frontend clears the stored access token.
6. **Roles** — `Admin` and `Agent` can manage customers/policies/claims/treaties and view executive analytics. `Customer` users see only their own policies/claims and cannot access executive analytics (`403`).

In production (`DJANGO_DEBUG=False`), session/refresh cookies are served Secure + HttpOnly, and CORS is restricted to the configured frontend origins with credentials allowed only for those origins.

---

## Claims Workflow

```text
Customer Registration
  → Policy Creation (bound to customer + reinsurance treaty)
    → Claim Submission (FNOL: gross loss, incident date, description, documents)
      → Server calculates: net eligible loss = gross loss − policy deductible,
        and the estimated treaty recovery from the policy's ceded share
      → Claims Review — a human adjuster records Approve / Hold / Reject
        • Hold always returns the claim to "Pending Review" (never Approved)
        • Every decision + note is appended to the claim's audit/activity log
      → Reinsurance Calculation (estimated → approved recovery, see below)
        → Financial Analytics (dashboard aggregates Approved claims only for recoveries;
          Pending Review claims are never counted as settled or paid)
```

---

## Reinsurance Calculation

For a proportional **Quota Share** treaty, the loss is split by the treaty's retained / ceded percentages *after* the policy deductible:

```text
Net eligible loss        = Gross claim loss − Deductible
Insurer retained loss    = Net eligible loss × Retained %
Reinsurer recovery (est.) = Net eligible loss × Ceded %
```

**Worked example — treaty `TRT-2026-01`, 60% retained / 40% ceded:**

```text
Gross claim loss:            $150,000
Deductible:                −  $50,000
Net eligible loss:           $100,000
Insurer retained (60%):       $60,000
Reinsurer recovery (40%):     $40,000   ← estimated recovery
```

Verify it yourself with `POST /api/reinsurance/treaties/TRT-2026-01/calculate-cession/` (`{"grossLoss": 150000, "deductible": 50000}`) or in the Reinsurance calculator in the UI.

### Estimated → Approved → Billed → Collected (do not conflate these)

| Stage | Meaning |
|---|---|
| **Estimated recovery** | Calculated at claim submission from the treaty split. A projection only |
| **Approved recovery** | The estimate attached to a claim a human adjuster has **Approved**. Still not cash |
| **Billed recovery** | The amount formally billed / cash-called to the reinsurer under the treaty |
| **Collected recovery** | Cash actually received from the reinsurer |

**Claim approval ≠ payment collection.** The executive dashboard's recovery KPI is therefore labelled **“Approved Recoveries (est.) — Not yet billed/collected”** in Live mode, and Pending Review claims contribute nothing to it.

---

## AI / RAG Architecture

The Knowledge Base / RAG Studio implements a genuine retrieval pipeline — answers are grounded in documents the organization actually uploaded, never in fabricated clauses:

```text
Upload (PDF / DOCX / TXT / MD, validated type & size, org-scoped, authenticated)
  → Text extraction (per file type)
    → Chunking (overlapping text chunks)
      → PostgreSQL storage (document + chunk rows, organization-scoped)
        → Question → organization-scoped lexical retrieval over that org's chunks only
          → Relevant chunks found?
             ├─ YES + Gemini available → grounded Gemini generation over the retrieved
             │   context only → answer + citations
             │   source: "django-gemini-rag-grounded"
             ├─ YES + Gemini unavailable → extractive fallback: answer is quoted /
             │   assembled from the retrieved chunks themselves → answer + citations
             │   source: "django-rag-extractive-fallback"
             └─ NO → no answer is invented
                 source: "rag-no-evidence" — "No evidence found in uploaded documents"
```

Key properties:

- **Citations** — every grounded/fallback answer returns citations with the document title, chunk number, page (when the source format provides one), and the supporting excerpt.
- **No fabrication** — when retrieval finds no relevant evidence, the API returns the no-evidence result instead of inventing policy clauses, coverage values, or citations.
- **Prompt-injection protection** — uploaded document text is treated as *data, not instructions*: retrieved content is sanitized/delimited before it reaches the model, and instructions embedded in a document cannot override the system prompt, tools, or access controls.
- **Access controls** — upload, list, delete, and ask are all authenticated and organization-scoped; one organization can never retrieve another's documents.
- **Clear source labelling** — the UI renders a source badge distinguishing *Live Gemini — grounded in your documents*, *Extractive fallback — quoted from documents, Gemini unavailable*, and *No evidence found in uploaded documents*, so a fallback is never presented as a live model answer.
- **Human-in-the-loop** — the separate `/api/ai/analyze-document/` advisory modes (policy Q&A, clause explanation, claims analysis) follow the same rule: advisory output with a human reviewer checklist, never an automated final decision.

---

## Automated Testing

### Backend (Django)

```bash
cd django_backend
python manage.py check
python manage.py test
# Fast / CI-friendly run with the SQLite override:
DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: python manage.py test
```

Backend tests use a separate test database and cover: authentication & token handling, role permissions, organization isolation / cross-tenant prevention, the claims workflow (including Hold-never-Approves), insurance & reinsurance calculations (including the $150k / $50k worked example above), dashboard analytics (including exclusion of Pending Review recoveries), and AI/RAG retrieval behaviour.

> Note: the SQLite override is for test speed and portability. A PostgreSQL run (`python manage.py test` with the normal `.env`) is the production-faithful check and should pass identically.

### Frontend (Vitest / lint / build)

```bash
npm test          # or: npx vitest run
npm run lint
npm run build
```

> **Honest testing note:** frontend tests are **unit tests of the service layer and components with HTTP mocked** (`vi.spyOn(djangoApiClient, …)`). They verify request shapes, response handling, and UI logic — they do **not** prove live Django/Gemini/PostgreSQL integration. Live integration is verified by running the full stack locally (backend + frontend + seeded login) and exercising the workflows in the browser.

---

## Production Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full production guide: recommended hosting, production environment checklist, migrate / collectstatic / seed steps, the `GET /api/health/` health check, the security checklist, and rollback notes.

**Do not deploy without reviewing that checklist — and never deploy the seeded demo credentials to production.**

---

## Portfolio Summary

InsureSphere AI demonstrates, in one coherent product:

- **Python / Django REST** API design with ViewSets, custom actions, serializers, and PostgreSQL aggregate analytics
- **PostgreSQL** data modelling with strict multi-tenant (organization) isolation and audit logging
- **React 19** SPA architecture with a dual Demo/Live service layer, JWT session restore, and honest live-vs-demo data labelling
- **Insurance domain logic** — deductibles, quota-share cession math, and the estimated → approved → billed → collected recovery lifecycle
- **Generative AI engineering** — a grounded RAG pipeline (ingestion → chunking → retrieval → cited generation) with prompt-injection safeguards, extractive fallback, and a no-evidence/no-answer guarantee
- **Security practice** — HttpOnly rotating refresh tokens with blacklisting, RBAC, CORS/CSRF configuration, server-side-only AI keys, and production `DEBUG=False` discipline
