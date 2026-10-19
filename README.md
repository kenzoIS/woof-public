# WOOF Cross-Intelligence Platform

WOOF is a full-stack cross-intelligence platform designed for a pet grooming, hotel, retail, and café business. It brings operational data, analytics, forecasting, pricing support, authentication, and administrative workflows into one system.

## Portfolio Highlights

- Full-stack architecture with a Next.js frontend and NestJS backend
- Supabase authentication with server-side session handling and MFA workflows
- MongoDB-backed operational data and analytics services
- Forecasting and business-intelligence modules for sales and service operations
- Role-aware administrative workflows and protected APIs
- Security hardening work covering cookies, CORS, security headers, throttling, RLS-related review, and environment isolation
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

## Repository Structure

```text
backend/      NestJS APIs, analytics services, database integrations
frontend/     Next.js application and UI
```

## Environment Configuration

This public portfolio repository does not contain production secrets. Create local environment files from the provided examples and use only your own development credentials.

```text
backend/.env.example -> backend/.env
```

Never commit `.env`, service-role keys, database passwords, private tokens, or production configuration.

## Security Note

This is a sanitized public portfolio snapshot. Production credentials, operational data, local environment files, private deployment values, generated artifacts, large datasets, scratch scripts, and internal-only development material are intentionally excluded.

## Portfolio Context

WOOF demonstrates applied Information Systems work across software engineering, business systems analysis, analytics, authentication/security, and decision-support development. The private development repository is maintained separately so that public source can remain safe for recruiter and technical-review access.
