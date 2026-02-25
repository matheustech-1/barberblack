# Deploy Guide (PHP + PostgreSQL)

## Requirements

- PHP 8.0+
- Extensions: `pdo_pgsql`, `pgsql`, `openssl`, `json`
- PostgreSQL 13+
- Apache with `mod_rewrite` (or equivalent rewrite in Nginx)

## 1) Upload files

Upload `api-php` to your server. Keep `public/` as web root for the API.

Recommended:

- API root: `.../api-php/public`
- Private files (`src`, `.env`, `sql`, `scripts`) outside public web root when possible

## 2) Environment (.env)

Set production values:

```env
APP_ENV=production
APP_DEBUG=false
CORS_ORIGIN=https://yourdomain.com

DATABASE_URL=postgres://user:password@db-host:5432/barber_db

ADMIN_USER=admin
ADMIN_PASSWORD=<strong-random-password>
ADMIN_JWT_SECRET=<strong-random-secret>
ADMIN_JWT_EXPIRES_IN=8h

PAYMENT_PROVIDER=manual_pix
PAYMENT_PIX_KEY=<your-pix-key>
PAYMENT_WEBHOOK_TOKEN=<strong-webhook-token>
```

## 3) Database

Run schema once in production:

```bash
php scripts/check_requirements.php
php scripts/db_init.php
```

## 4) Web server

### Apache

- Ensure `AllowOverride All` for `public/`
- Keep `public/.htaccess` enabled

### Nginx (reference)

Use `try_files $uri /index.php?$query_string;` for API routes.

## 5) Frontend API base

If frontend and API are same domain:

- frontend calls can stay `/api/...`

If API is separate domain:

- set `window.BARBER_API_BASE` in pages/scripts to the full API URL
- update `CORS_ORIGIN` accordingly

## 6) Smoke tests

- `GET /api/health`
- `GET /api/services`
- `POST /api/admin/login`
- `POST /api/appointments`
- `POST /api/payments/checkout`

## 7) Security baseline

- Force HTTPS
- Rotate admin password and JWT secret
- Keep webhook token mandatory in production
- Restrict DB user privileges
- Enable backups for PostgreSQL
