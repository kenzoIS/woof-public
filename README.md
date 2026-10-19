# WOOF Cross-Intelligence Platform

WOOF is a full-stack cross-intelligence platform designed for a pet grooming, hotel, retail, and café business. It brings operational data, analytics, forecasting, pricing support, authentication, and administrative workflows into one system.

## Portfolio Highlights

- Full-stack architecture with a Next.js frontend and NestJS backend
- Supabase authentication with server-side session handling and MFA workflows
- MongoDB-backed operational data and analytics services
- Forecasting and business-intelligence modules for sales and service operations
- Role-aware administrative workflows and protected APIs
- Security hardening covering HttpOnly cookies, rate limiting, MFA assurance, RLS enforcement, CORS/security configuration, and environment isolation
- Business-focused modules including pricing, bundle simulation, inventory/service analytics, and operational dashboards

## Tech Stack

- Next.js / React / TypeScript
- NestJS / Node.js
- Supabase Auth
- MongoDB / Mongoose
- PostgreSQL integrations
- Socket.IO
- Python analytics dependencies
- Material UI / Radix UI / Recharts

## Public Snapshot Scope

This repository intentionally publishes **selected representative implementation files**, not a deployment mirror of the private capstone repository. The public selection focuses on architecture, security controls, dependency/configuration structure, password recovery, and database security while keeping private operational code and configuration separate.

Current public examples include:

```text
backend/.env.example
backend/package.json
backend/src/app.module.ts
backend/src/common/guards/supabase-auth.guard.ts
backend/src/common/supabase/supabase.service.ts
backend/database/migrations/20261014_enable_rls_application_tables.sql
frontend/package.json
frontend/pages/reset-password.tsx
```

## Environment Configuration

This public portfolio repository contains no production credentials. Create local environment files from the provided examples and use only your own development credentials.

```text
backend/.env.example -> backend/.env
```

Never commit `.env`, service-role keys, database passwords, private tokens, or production configuration.

## Security Note

Production credentials, operational data, local environment files, private deployment values, generated artifacts, large datasets, scratch scripts, and internal-only development material are intentionally excluded.

## Portfolio Context

WOOF demonstrates applied Information Systems work across software engineering, business systems analysis, analytics, authentication/security, and decision-support development. The private development repository is maintained separately so that public source can remain safe for recruiter and technical-review access.
