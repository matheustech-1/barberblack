import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import { pool, query } from "./config/db.js";
import { env } from "./config/env.js";
import { requireAdmin } from "./middleware/adminAuth.js";
import { HttpError } from "./utils/httpError.js";
import { durationToSeconds, encodeJwt } from "./utils/jwt.js";

const app = express();

const corsOptions = {
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Token"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.use((req, _res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4);
  }
  next();
});

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizePaymentStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["paid", "approved", "succeeded", "success"].includes(normalized)) return "paid";
  if (["pending", "in_process", "waiting"].includes(normalized)) return "pending";
  if (["failed", "rejected", "error"].includes(normalized)) return "failed";
  if (["cancelled", "canceled", "voided"].includes(normalized)) return "cancelled";
  return null;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get("/", (_req, res) => {
  res.json({ message: "Project Barber Node API online" });
});

app.get(
  "/health",
  asyncHandler(async (_req, res) => {
    await query("SELECT 1");
    res.json({
      status: "ok",
      database: "connected"
    });
  })
);

app.get(
  "/services",
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, description, duration_minutes, price_cents
       FROM services
       WHERE active = true
       ORDER BY name ASC`
    );
    res.json({ services: result.rows });
  })
);

app.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT id, name, description, monthly_price_cents, cuts_per_month
       FROM plans
       WHERE active = true
       ORDER BY monthly_price_cents ASC`
    );
    res.json({ plans: result.rows });
  })
);

app.post(
  "/appointments",
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    const name = String(body.name || "").trim();
    const phone = normalizePhone(body.phone);
    const serviceId = String(body.serviceId || "").trim();
    const appointmentDate = String(body.appointmentDate || "").trim();
    const appointmentTime = String(body.appointmentTime || "").trim();
    const paymentMethod = String(body.paymentMethod || "onsite").trim() || "onsite";
    const notes = String(body.notes || "").trim();
    const barberId = String(body.barberId || "").trim();

    if (!name || !phone || !serviceId || !appointmentDate || !appointmentTime) {
      throw new HttpError(
        "name, phone, serviceId, appointmentDate and appointmentTime are required",
        400
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || !/^\d{2}:\d{2}$/.test(appointmentTime)) {
      throw new HttpError("Invalid date or time format. Use YYYY-MM-DD and HH:mm", 400);
    }

    if (phone.length < 10 || phone.length > 13) {
      throw new HttpError("Invalid phone number", 400);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const customerResult = await client.query(
        `INSERT INTO customers (name, phone)
         VALUES ($1, $2)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, phone`,
        [name, phone]
      );
      const customer = customerResult.rows[0];

      const serviceResult = await client.query(
        `SELECT id FROM services WHERE id = $1 AND active = true`,
        [serviceId]
      );
      if (!serviceResult.rowCount) {
        throw new HttpError("Service not found", 404);
      }

      const clashResult = await client.query(
        `SELECT id
         FROM appointments
         WHERE barber_id IS NOT DISTINCT FROM $1
           AND appointment_date = $2
           AND appointment_time = $3
           AND status IN ('pending_payment', 'confirmed')
         LIMIT 1`,
        [barberId || null, appointmentDate, appointmentTime]
      );

      if (clashResult.rowCount) {
        throw new HttpError("This time slot is already booked", 409);
      }

      const appointmentResult = await client.query(
        `INSERT INTO appointments (
           customer_id,
           service_id,
           barber_id,
           appointment_date,
           appointment_time,
           payment_method,
           notes,
           status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_payment')
         RETURNING
           id,
           customer_id,
           service_id,
           barber_id,
           appointment_date,
           appointment_time,
           payment_method,
           status,
           created_at`,
        [
          customer.id,
          serviceResult.rows[0].id,
          barberId || null,
          appointmentDate,
          appointmentTime,
          paymentMethod,
          notes || null
        ]
      );

      await client.query("COMMIT");
      res.status(201).json({
        appointment: appointmentResult.rows[0],
        customer
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof HttpError) throw error;
      throw new HttpError("Failed to create appointment", 500);
    } finally {
      client.release();
    }
  })
);

app.post(
  "/payments/checkout",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const appointmentId = String(body.appointmentId || "").trim();
    let provider = String(body.provider || env.PAYMENT_PROVIDER || "manual_pix").trim();
    const amountCents = Number.isFinite(Number(body.amountCents)) ? Number(body.amountCents) : null;

    if (!appointmentId) {
      throw new HttpError("appointmentId is required", 400);
    }
    if (!provider) {
      provider = "manual_pix";
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const appointmentResult = await client.query(
        `SELECT a.id, a.status, s.price_cents
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         WHERE a.id = $1
         LIMIT 1`,
        [appointmentId]
      );

      if (!appointmentResult.rowCount) {
        throw new HttpError("Appointment not found", 404);
      }

      const appointment = appointmentResult.rows[0];
      if (["cancelled", "completed"].includes(String(appointment.status))) {
        throw new HttpError("Appointment is not eligible for payment", 409);
      }

      const finalAmount =
        amountCents !== null && amountCents > 0 ? amountCents : Number(appointment.price_cents);
      const externalId = `pay_${crypto.randomBytes(8).toString("hex")}`;

      const paymentResult = await client.query(
        `INSERT INTO payments (appointment_id, provider, external_id, amount_cents, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, appointment_id, provider, external_id, amount_cents, status, created_at`,
        [appointmentId, provider, externalId, finalAmount]
      );

      await client.query("COMMIT");
      res.status(201).json({
        payment: paymentResult.rows[0],
        instructions: {
          type: provider,
          message:
            "Checkout created. Integrate provider API to generate payment link or PIX payload.",
          pixKey: env.PAYMENT_PIX_KEY || ""
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof HttpError) throw error;
      throw new HttpError("Failed to create checkout", 500);
    } finally {
      client.release();
    }
  })
);

app.post(
  "/payments/webhook",
  asyncHandler(async (req, res) => {
    if (env.PAYMENT_WEBHOOK_TOKEN) {
      const received = String(req.headers["x-webhook-token"] || "");
      if (received !== env.PAYMENT_WEBHOOK_TOKEN) {
        throw new HttpError("Invalid webhook token", 401);
      }
    }

    const body = req.body || {};
    const paymentId = String(body.paymentId || "").trim();
    const externalId = String(body.externalId || "").trim();
    const provider = String(body.provider || "manual_pix").trim() || "manual_pix";
    const eventType = String(body.eventType || "payment_update").trim() || "payment_update";
    const statusRaw = String(body.paymentStatus || body.status || "").trim();

    if (!paymentId && !externalId) {
      throw new HttpError("paymentId or externalId is required", 400);
    }

    if (!statusRaw) {
      throw new HttpError("paymentStatus is required", 400);
    }

    const normalizedStatus = normalizePaymentStatus(statusRaw);
    if (!normalizedStatus) {
      throw new HttpError("Invalid paymentStatus", 400);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const paymentResult = paymentId
        ? await client.query(
            `SELECT id, appointment_id, status, external_id
             FROM payments
             WHERE id = $1
             LIMIT 1`,
            [paymentId]
          )
        : await client.query(
            `SELECT id, appointment_id, status, external_id
             FROM payments
             WHERE external_id = $1
             LIMIT 1`,
            [externalId]
          );

      if (!paymentResult.rowCount) {
        throw new HttpError("Payment not found", 404);
      }

      const payment = paymentResult.rows[0];
      let resolvedExternalId = externalId || payment.external_id || "";
      if (!resolvedExternalId) {
        resolvedExternalId = `evt_${crypto.randomBytes(8).toString("hex")}`;
      }

      const updatedPaymentResult = await client.query(
        `UPDATE payments
         SET
           provider = $1,
           external_id = $2,
           status = $3,
           paid_at = CASE WHEN $3 = 'paid' THEN NOW() ELSE paid_at END,
           updated_at = NOW()
         WHERE id = $4
         RETURNING id, appointment_id, status, external_id, paid_at`,
        [provider, resolvedExternalId, normalizedStatus, payment.id]
      );
      const updatedPayment = updatedPaymentResult.rows[0];

      if (normalizedStatus === "paid" && updatedPayment.appointment_id) {
        await client.query(
          `UPDATE appointments
           SET status = 'confirmed', updated_at = NOW()
           WHERE id = $1
             AND status IN ('pending_payment', 'confirmed')`,
          [updatedPayment.appointment_id]
        );
      }

      await client.query(
        `INSERT INTO webhook_events (provider, event_type, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [provider, eventType, JSON.stringify(body || {})]
      );

      await client.query("COMMIT");
      res.json({
        ok: true,
        payment: updatedPayment
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof HttpError) throw error;
      throw new HttpError("Failed to process webhook", 500);
    } finally {
      client.release();
    }
  })
);

app.post(
  "/admin/login",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();

    if (!username || !password) {
      throw new HttpError("username and password are required", 400);
    }

    if (username !== env.ADMIN_USER || password !== env.ADMIN_PASSWORD) {
      throw new HttpError("Invalid credentials", 401);
    }

    const expiresIn = durationToSeconds(env.ADMIN_JWT_EXPIRES_IN);
    const token = encodeJwt(
      {
        role: "admin",
        username,
        exp: Math.floor(Date.now() / 1000) + expiresIn
      },
      env.ADMIN_JWT_SECRET
    );

    res.json({ token });
  })
);

app.get(
  "/admin/appointments",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT
         a.id,
         a.appointment_date,
         a.appointment_time,
         a.status,
         a.payment_method,
         a.notes,
         c.name AS customer_name,
         c.phone AS customer_phone,
         s.name AS service_name,
         b.name AS barber_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN services s ON s.id = a.service_id
       LEFT JOIN barbers b ON b.id = a.barber_id
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT 200`
    );

    res.json({ appointments: result.rows });
  })
);

app.get(
  "/admin/dashboard",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT status, COUNT(*)::int AS total
       FROM appointments
       GROUP BY status`
    );
    res.json({ stats: result.rows });
  })
);

app.patch(
  "/admin/appointments/:appointmentId/status",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = String(req.body?.status || "").trim();
    const allowedStatus = ["pending_payment", "confirmed", "cancelled", "completed"];

    if (!allowedStatus.includes(status)) {
      throw new HttpError("Invalid status", 400);
    }

    const result = await query(
      `UPDATE appointments
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, req.params.appointmentId]
    );

    if (!result.rowCount) {
      throw new HttpError("Appointment not found", 404);
    }

    res.json({ appointment: result.rows[0] });
  })
);

app.use((_req, _res, next) => {
  next(new HttpError("Route not found", 404));
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, "body")) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.PORT, () => {
  console.log(`API online on port ${env.PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
