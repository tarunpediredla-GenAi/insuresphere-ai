# InsureSphere AI — Production Deployment Guide

> **Do not deploy without explicit approval from the project owner.**
> This document prepares a deployment; it does not perform one.

InsureSphere AI has three production pieces: the Django REST API (`django_backend/` — the only backend; ignore the legacy `backend_django/` duplicate), a PostgreSQL database, and the React static build.

---

## Recommended Hosting

| Piece | Recommended options | Notes |
|---|---|---|
| Backend API | **Render** or **Railway** (simplest), or **AWS EC2 + Docker** with Gunicorn behind a reverse proxy (most control) | Run with Gunicorn, never the Django dev server: `gunicorn insuresphere_core.wsgi:application --bind 0.0.0.0:$PORT` |
| Database | **Managed PostgreSQL** — Render PostgreSQL, Railway PostgreSQL, AWS RDS for PostgreSQL, or Neon/Supabase | Managed = automated backups, patching, and connection management. Do not self-host the production database on the app server |
| Frontend | **Vercel** or **Netlify**, or serve the Vite `dist/` build from the same host as the API | Set `VITE_DJANGO_API_URL` at build time to the deployed API's `/api` base URL, and add the frontend origin to the backend's `CORS_ALLOWED_ORIGINS` |

A simple, credible starter topology: **API on Render + managed PostgreSQL on Render/RDS + frontend on Vercel**, all behind HTTPS.

---

## Production Environment Checklist

Set these in the hosting platform's environment/secret settings — **never in committed files**:

- [ ] `DJANGO_DEBUG=False`
- [ ] `DJANGO_SECRET_KEY` — a fresh, strong, unique secret (50+ random characters). This also signs JWTs
- [ ] `DJANGO_ALLOWED_HOSTS` — the real API hostname(s) only, e.g. `api.example.com`
- [ ] `DB_ENGINE=django.db.backends.postgresql`
- [ ] `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` — managed PostgreSQL credentials from the provider (use the provider's internal/private hostname where offered)
- [ ] `CORS_ALLOWED_ORIGINS` — the real frontend origin(s) only, e.g. `https://app.example.com`
- [ ] `GEMINI_API_KEY` — **server-side only**, set only on the backend service. It must never appear in the frontend build, a `VITE_*` variable, or client-side code
- [ ] `VITE_DJANGO_API_URL` (frontend build-time only) — e.g. `https://api.example.com/api`
- [ ] `N8N_CLAIMS_WEBHOOK_URL` — only if the optional n8n claims-triage integration is used in production

---

## Deploy Steps

### 1. Backend

```bash
cd django_backend
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
# Production start command (example):
gunicorn insuresphere_core.wsgi:application --bind 0.0.0.0:8000 --workers 3
```

- Serve uploaded/static files via the platform, a reverse proxy, or object storage — not via Django in production.
- Run `migrate` as a one-off release step on every deploy that changes models.

### 2. Seeding

```bash
python manage.py seed_insuresphere   # ⚠️ LOCAL / DEMO ENVIRONMENTS ONLY
```

The seed command creates demo data **and a known demo login**. Use it only to stand up a throwaway demo environment. For a real production environment, create the first admin through a controlled, private process instead (see the warning below).

### 3. Frontend

```bash
npm install
npm run build        # outputs dist/
```

Deploy the contents of `dist/` to Vercel/Netlify (or your static host). Rebuild whenever `VITE_DJANGO_API_URL` changes — Vite embeds it at build time.

### 4. Verify

- [ ] Health check responds: `GET https://<api-host>/api/health/` → `{"status": "ok"}`
- [ ] Login works over HTTPS and the refresh cookie is set (Secure + HttpOnly)
- [ ] Dashboard KPIs load from the live API in Live Django Mode (no demo data)
- [ ] A RAG document upload → ask → cited answer round-trip works, and deleting the document removes it from retrieval
- [ ] A user from a second organization cannot see the first organization's data

---

## Security Checklist

- [ ] **HTTPS everywhere** — API and frontend; redirect HTTP → HTTPS at the platform/proxy level
- [ ] **`DJANGO_DEBUG=False`** — verified in the deployed environment, not just in the checklist. Debug pages leak settings and stack traces
- [ ] **Secure cookies** — with `DEBUG=False`, session/refresh cookies must be Secure + HttpOnly (verify in browser dev tools after login)
- [ ] **Strong, unique `DJANGO_SECRET_KEY`** set via the platform's secret store; changing it invalidates existing JWTs (plan for a forced re-login)
- [ ] **Secret rotation** — rotate any previously shared Gemini key before going live: revoke the old key in Google AI Studio / Google Cloud and issue a fresh `GEMINI_API_KEY` that exists only in the production secret store. Do the same for the database password if it was ever shared outside the secret store
- [ ] `GEMINI_API_KEY` exists **only** on the backend service — grep the frontend build output to confirm it does not contain the key
- [ ] CORS restricted to the production frontend origin(s); no wildcard origins with credentials
- [ ] Database reachable only from the API service (private networking / security-group rules); no public DB port
- [ ] `.env` files are git-ignored and absent from the deployed artifact except via platform secrets
- [ ] Admin interface (`/admin/`) restricted (strong admin credentials; IP allowlist where the platform supports it)
- [ ] Platform backups enabled for PostgreSQL, with a tested restore (see Rollback)

### ⚠️ Demo credentials warning

**Do not deploy seeded demo credentials to production.** The `seed_insuresphere` command creates a widely known demo login intended for local development only. A production environment must not contain that account (or any seeded demo users/data). If a demo environment is deployed publicly, treat it as disposable: use throwaway data, and rotate/remove the seeded accounts before any real use.

---

## Rollback Notes

- **Application rollback** — redeploy the previous known-good release/commit on the hosting platform (Render/Railway/Vercel all keep prior deploys for one-click rollback). Keep the previous frontend build available alongside the API rollback so API/frontend versions stay compatible.
- **Migration caution** — before deploying a release with migrations, take a database snapshot/backup. Rolling back code does **not** roll back schema. If a migration must be reversed, use Django's `migrate <app> <previous_migration>` only after confirming the migration is reversible and a backup exists; otherwise restore the pre-deploy database snapshot.
- **Secret rollback** — if a deploy fails after rotating `DJANGO_SECRET_KEY` or DB credentials, restore the previous secret values from the platform's secret history; expect all users to be logged out after a secret-key change.
- **Post-rollback verification** — re-run the health check (`GET /api/health/`), a login, and one read from each core resource (customers, policies, claims) before declaring the rollback complete.
- **Incident note** — record what was rolled back, from which version to which, and whether any data written by the bad release needs reconciliation (especially claims decisions and recovery figures).

---

## Pre-Deploy Sign-off

- [ ] Backend tests pass (`python manage.py test`, ideally also against PostgreSQL)
- [ ] Frontend checks pass (`npx vitest run`, `npm run lint`, `npm run build`)
- [ ] Production environment checklist above is fully set in the platform
- [ ] Security checklist above is fully verified
- [ ] Database backup/snapshot taken immediately before deploy
- [ ] Project owner has given explicit approval to deploy
