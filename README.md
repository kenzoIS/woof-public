# WOOF Cross-Intelligence Platform

WOOF (Workflow Optimization, Orchestration, & Forecasting) is a full-stack cross-intelligence and business analytics platform built for a multi-service pet business covering café, retail, grooming, hotel, and related service operations. The platform integrates operational workflows, business intelligence, forecasting, prescriptive decision support, authentication, and administrative controls into a single system.

## Highlights

- Supports a multi-module business intelligence environment with **15 dashboard pages** and **82 REST API endpoints**.
- Processes **92K+ POS records**, representing **43K+ unique transactions** from March 2021 to May 2026.
- Implements ETL workflows for CSV/XLSX validation, cleaning, duplicate handling, schema mapping, and KPI aggregation.
- Provides descriptive, diagnostic, predictive, and prescriptive analytics across **Café, Services, and Retail** operations.
- Generates **30–90 day demand and revenue forecasts** using Prophet and SARIMA/SARIMAX with chronological validation, backtesting, and MAE/RMSE/MAPE evaluation.
- Includes association-rule mining, automated model retraining on newly ingested data, and LLM-assisted analytics functionality.
- Implements security controls including Supabase authentication, MFA workflows, HttpOnly session cookies, role-based access control, access reviews, audit logging and monitoring, RLS-related database controls, CORS restrictions, and API security hardening.
- Includes operational decision-support features such as pricing analysis, bundle simulation, inventory/service analytics, alerts, and recommendation workflows.

## Project Structure

```text
WOOF/
├── backend/
│   ├── src/                    # NestJS application modules and REST APIs
│   ├── database/migrations/    # Database and security migrations
│   ├── requirements.txt        # Python analytics dependencies
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── pages/                  # Next.js application pages
│   ├── components/             # Reusable UI and dashboard components
│   ├── public/                 # Static assets
│   └── package.json
├── *.csv                       # Project datasets used by analytics workflows
└── README.md
```

## Tech Stack

### Frontend
- Next.js 15
- React 18
- TypeScript
- Material UI
- Radix UI
- Recharts
- SWR
- Socket.IO Client

### Backend
- NestJS 11
- Node.js
- TypeScript
- REST APIs
- Socket.IO
- Mongoose
- PostgreSQL client integration

### Data, Analytics & AI
- Python
- Pandas / NumPy
- Prophet
- SARIMA / SARIMAX
- Forecast evaluation using MAE, RMSE, and MAPE
- Association-rule mining
- Automated retraining workflows
- LLM integration

### Databases & Services
- MongoDB
- Supabase / PostgreSQL
- Supabase Auth
- AWS S3

### Security
- Authentication and MFA
- Role-based access control
- HttpOnly cookie-based sessions
- Row Level Security support
- Audit logging and monitoring
- CORS restrictions
- API throttling and validation
- Environment-based secret management

## Environment Setup

The repository does not include production credentials. Create your own local environment configuration from the supplied template:

```bash
cp backend/.env.example backend/.env
```

Example backend variables include:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@HOST/DATABASE
MONGODB_DB=woof_local
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
WOOF_ADMIN_EMAIL=admin@example.com
SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL=http://localhost:3002/reset-password
CORS_ALLOWED_ORIGINS=http://localhost:3002
TRUST_PROXY=false
ALLOWED_COUNTRIES=PH
```

Use credentials from your own MongoDB, Supabase, and external service accounts. Never commit `.env` files or service-role credentials.

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/kenzoIS/woof-public.git
cd woof-public
```

### 2. Install backend dependencies

```bash
cd backend
npm install
python -m pip install -r requirements.txt
```

Create `backend/.env` from `.env.example`, then start the API:

```bash
npm run start:dev
```

The backend uses port `3001` by default when configured through the environment file.

### 3. Install frontend dependencies

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The Next.js development server runs on:

```text
http://localhost:3002
```

### 4. Configure data services

To use the complete application functionality, configure your own:

- MongoDB database
- Supabase project and authentication settings
- PostgreSQL/Supabase database schema and migrations
- AWS S3 configuration where storage functionality is required
- External AI/API credentials for optional integrations

## Configuration & Security Notes

- Real credentials and local `.env` files are intentionally excluded from version control.
- Server-only keys such as the Supabase service-role key must never be exposed to the browser.
- Database security policies and migrations should be reviewed before connecting the project to any production environment.
- Public datasets included in the repository are intended for development and analytics reproduction only.
- Review deployment-specific CORS, session, MFA, storage, and database policies before production use.
