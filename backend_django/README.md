# InsureSphere AI — Python Django REST Framework (DRF) Backend

This directory (`/backend_django/`) contains the complete, production-oriented **Python Django 5.1 + Django REST Framework + SimpleJWT + PostgreSQL** backend for **InsureSphere AI**.

---

## 1. Project Folder Structure

```text
backend_django/
├── manage.py
├── requirements.txt
├── .env.example
├── README.md
├── insuresphere_core/        # Root project settings, URLs, WSGI, Pagination & Exceptions
│   ├── settings.py
│   ├── urls.py
│   ├── pagination.py
│   ├── exceptions.py
│   └── wsgi.py
├── accounts/                 # Multi-tenant Organization, Custom User, SimpleJWT, RBAC
│   ├── models.py
│   ├── permissions.py
│   ├── serializers.py
│   ├── views.py
│   ├── urls.py
│   └── management/commands/seed_insuresphere.py
├── customers/                # Insured Customer CRUD, Search, Filtering, Annotations
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
├── policies/                 # Insurance Policy Binding, Renewal & Treaty Linkage
│   ├── models.py
│   ├── views.py
│   └── urls.py
├── claims/                   # FNOL Claims, Supporting Docs & Immutable Audit Logs
│   ├── models.py
│   ├── views.py
│   └── urls.py
├── reinsurance/              # Quota Share / Surplus / XoL Treaties & Cession Math
│   ├── models.py
│   ├── views.py
│   └── urls.py
├── analytics/                # PostgreSQL Portfolio Aggregations (Sum, Count, Q)
│   ├── views.py
│   └── urls.py
└── ai_assistant/             # Google Gemini RAG & Claims Triage Advisory API
    ├── views.py
    └── urls.py
```

---

## 2. Step-by-Step Setup in VS Code

### Step 1: Create & Configure PostgreSQL Database
Open your terminal or `psql` shell and run:
```sql
CREATE DATABASE insuresphere_db;
CREATE USER insuresphere_user WITH PASSWORD 'strong_postgres_password';
ALTER ROLE insuresphere_user SET client_encoding TO 'utf8';
ALTER ROLE insuresphere_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE insuresphere_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE insuresphere_db TO insuresphere_user;
\c insuresphere_db
GRANT ALL ON SCHEMA public TO insuresphere_user;
```

### Step 2: Create a Python Virtual Environment & Install Packages
In your VS Code terminal:
```bash
cd backend_django
python -m venv venv

# Activate on Windows:
venv\Scripts\activate
# Activate on macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

### Step 3: Run Migrations & Seed Initial Enterprise Data
```bash
python manage.py makemigrations accounts customers reinsurance policies claims
python manage.py migrate
python manage.py seed_insuresphere
```

### Step 4: Start the Django REST Server on Port 8000
```bash
python manage.py runserver 127.0.0.1:8000
```

---

## 3. Testing the REST APIs with cURL or Postman

### 1. Authenticate & Obtain JWT Access Token (`POST /api/auth/login/`)
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "elena.vance@insuresphere.ai", "password": "InsureSphere2026!"}'
```

### 2. List Customers with Search & Filtering (`GET /api/customers/`)
```bash
curl -X GET "http://127.0.0.1:8000/api/customers/?search=Meridian&risk_tier=Moderate%20Risk" \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### 3. Create a New Customer (`POST /api/customers/`)
```bash
curl -X POST http://127.0.0.1:8000/api/customers/ \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pacific Rim Container Lines",
    "contactPerson": "Kenji Takahashi",
    "email": "ktakahashi@pacificrimlines.com",
    "accountType": "Corporate",
    "industry": "Ocean Freight",
    "riskTier": "Moderate Risk",
    "riskScore": 46,
    "city": "Seattle, WA",
    "annualRevenue": "$310,000,000"
  }'
```

### 4. Fetch Executive Dashboard Analytics (`GET /api/dashboard/analytics/`)
```bash
curl -X GET http://127.0.0.1:8000/api/dashboard/analytics/ \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```
