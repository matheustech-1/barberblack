# Backend Node.js - Project Barber

API REST em JavaScript (Node.js + Express + PostgreSQL), mantendo as rotas usadas pelo frontend.

## Estrutura

- `src/server.js`: servidor e rotas
- `sql/schema.sql`: schema do PostgreSQL
- `scripts/db-init.js`: inicializa o banco
- `scripts/smoke-test.ps1`: teste rapido dos endpoints

## 1) Configurar ambiente

Copie `.env.example` para `.env`:

```powershell
Copy-Item .env.example .env
```

Ajuste no `.env`:

- `DATABASE_URL`
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `CORS_ORIGIN`

## 2) Instalar dependencias

```powershell
npm install
```

## 3) Inicializar banco

```powershell
npm run db:init
```

## 4) Rodar API local

```powershell
npm run dev
```

API local: `http://127.0.0.1:8080/api`

## Endpoints

- `GET /api/health`
- `GET /api/services`
- `GET /api/plans`
- `POST /api/appointments`
- `POST /api/payments/checkout`
- `POST /api/payments/webhook`
- `POST /api/admin/login`
- `GET /api/admin/appointments` (Bearer token)
- `PATCH /api/admin/appointments/{id}/status` (Bearer token)
- `GET /api/admin/dashboard` (Bearer token)

## Smoke test (PowerShell)

```powershell
.\scripts\smoke-test.ps1 -ApiBase "http://127.0.0.1:8080" -AdminUser "admin" -AdminPassword "SUA_SENHA"
```

