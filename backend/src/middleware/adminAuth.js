import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { decodeJwt } from "../utils/jwt.js";

export function requireAdmin(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    next(new HttpError("Missing admin token", 401));
    return;
  }

  const token = authHeader.slice(7).trim();
  const payload = decodeJwt(token, env.ADMIN_JWT_SECRET);
  if (!payload || payload.role !== "admin") {
    next(new HttpError("Invalid or expired admin token", 401));
    return;
  }

  req.admin = payload;
  next();
}

