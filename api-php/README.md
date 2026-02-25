# API PHP (Pure) - Project Barber

REST backend in pure PHP (no framework), compatible with the current frontend.

## Structure

- `public/index.php`: front controller and HTTP router
- `src/`: API classes (router, auth, jwt, db, controllers)
- `sql/schema.sql`: PostgreSQL schema
- `scripts/db_init.php`: schema bootstrap without `psql`

## 1) Environment

Copy `.env.example` to `.env` and update:

- `DATABASE_URL`
- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `CORS_ORIGIN`
- `PAYMENT_PROVIDER`
- `PAYMENT_PIX_KEY`
- `PAYMENT_WEBHOOK_TOKEN`

Example:

```env
DATABASE_URL=postgres://postgres:MyStrongPassword@localhost:5432/barber_db
```

## 2) Initialize DB

With PHP CLI:

```bash
php scripts/check_requirements.php
php scripts/db_init.php
```

If `php` is not in PATH, use full path, e.g. `C:\xampp\php\php.exe`.

## 3) Run local API

```bash
php -S 127.0.0.1:8080 -t public
```

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

Note: Router accepts both `/health` and `/api/health`.

## Payment flow (base)

1. Create appointment via `POST /api/appointments`
2. Create checkout via `POST /api/payments/checkout`
3. Provider callback to `POST /api/payments/webhook`
4. When webhook status is `paid`, appointment is automatically set to `confirmed`
