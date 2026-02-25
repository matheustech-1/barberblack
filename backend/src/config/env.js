import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(value).trim();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

export const env = {
  PORT: Number(optional("PORT", "8080")),
  APP_ENV: optional("APP_ENV", "local"),
  APP_DEBUG: optional("APP_DEBUG", "false").toLowerCase() === "true",
  CORS_ORIGIN: optional("CORS_ORIGIN", "*"),
  DATABASE_URL: required("DATABASE_URL"),
  ADMIN_USER: required("ADMIN_USER"),
  ADMIN_PASSWORD: required("ADMIN_PASSWORD"),
  ADMIN_JWT_SECRET: required("ADMIN_JWT_SECRET"),
  ADMIN_JWT_EXPIRES_IN: optional("ADMIN_JWT_EXPIRES_IN", "8h"),
  PAYMENT_PROVIDER: optional("PAYMENT_PROVIDER", "manual_pix"),
  PAYMENT_PIX_KEY: optional("PAYMENT_PIX_KEY", ""),
  PAYMENT_WEBHOOK_TOKEN: optional("PAYMENT_WEBHOOK_TOKEN", "")
};

