import crypto from "node:crypto";

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padding = value.length % 4;
  const padded = padding > 0 ? value + "=".repeat(4 - padding) : value;
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest();
  const signatureEncoded = base64UrlEncode(signature);
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

export function decodeJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const expectedSignature = base64UrlEncode(
    crypto
      .createHmac("sha256", secret)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest()
  );

  if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureEncoded))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded));
  } catch (_error) {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function durationToSeconds(duration) {
  const match = /^(\d+)([smhd])$/.exec(String(duration || ""));
  if (!match) {
    return 8 * 3600;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  if (unit === "d") return amount * 86400;
  return 8 * 3600;
}

