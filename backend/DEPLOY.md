# Deploy Guide (Node.js + PostgreSQL)

## Requisitos

- Node.js 20+
- PostgreSQL 13+

## 1) Variaveis de ambiente

Use `backend/.env.production.example` como base e configure:

- `DATABASE_URL`
- `CORS_ORIGIN` (URL do frontend)
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `PAYMENT_*`

## 2) Build/Run

```powershell
npm install
npm run db:init
npm run start
```

## 3) Smoke test

```powershell
.\scripts\smoke-test.ps1 -ApiBase "https://sua-api.com" -AdminUser "admin" -AdminPassword "SUA_SENHA"
```

## 4) Frontend API base

- Mesmo dominio: usar `/api`
- Dominio separado: definir URL completa em `assets/js/api-config.js`

## 5) Nota sobre GitHub Pages

- GitHub Pages nao roda backend Node/PHP.
- Use GitHub Pages para frontend estatico e hospede a API em outro provedor.

