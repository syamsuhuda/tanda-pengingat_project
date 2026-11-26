import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";
import { getRedis } from "./redis";
import type { OtpPurpose } from "./types";

export const SESSION_COOKIE_NAME = "pj_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 hari
export const SESSION_VERSION_REDIS_KEY = "auth:meta:session_version";

export const AUTH_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

// Hapus CR/LF, karakter kontrol ASCII, dan tanda kutip ganda untuk mencegah SMTP Header Injection & rusaknya param ICS.
export function sanitizeSenderDisplayName(
  raw: string | undefined | null,
  fallback = "Pengingat Jadwal",
): string {
  const cleaned = (raw ?? "")
    .replace(/[\r\n\0\x00-\x1F\x7F]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  if (cleaned.length > 0) {
    return cleaned;
  }

  const safeFallback = fallback
    .replace(/[\r\n\0\x00-\x1F\x7F]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return safeFallback || "Pengingat Jadwal";
}

export function sanitizeEmailHeaderValue(raw: string, maxLength = 180): string {
  return raw
    .replace(/[\r\n\0\x00-\x1F\x7F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// Hash kedua input sebelum timingSafeEqual agar panjang string yang berbeda tidak menimbulkan RangeError maupun bocoran panjang.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a, "utf8").digest();
  const digestB = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin, "utf8").digest("hex");
}

export function verifyPin(pin: string): boolean {
  const env = getEnv();
  const inputHash = hashPin(pin);
  return timingSafeStringEqual(inputHash, env.APP_PIN_HASH);
}

export function hashPinScrypt(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPinScrypt(pin: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!/^[a-fA-F0-9]{32}$/.test(salt) || !/^[a-fA-F0-9]{128}$/.test(expectedHex)) {
    return false;
  }
  const derived = crypto.scryptSync(pin, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, "hex");
  if (derived.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function generateNumericOtp6(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export function hashOtpHmac(otp: string, salt: string): string {
  const env = getEnv();
  return crypto
    .createHmac("sha256", env.HMAC_SECRET)
    .update(`pin-reset-otp:${salt}:${otp}`, "utf8")
    .digest("hex");
}

export function verifyOtpHmac(otp: string, salt: string, expectedHmac: string): boolean {
  if (!/^\d{6}$/.test(otp) || !salt || !/^[a-fA-F0-9]{64}$/.test(expectedHmac)) {
    return false;
  }
  const candidate = hashOtpHmac(otp, salt);
  return timingSafeStringEqual(candidate, expectedHmac.toLowerCase());
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPurposeToken(purpose: OtpPurpose, token: string, salt: string): string {
  const env = getEnv();
  return crypto
    .createHmac("sha256", env.HMAC_SECRET)
    .update(`pin-ticket:${purpose}:${salt}:${token}`, "utf8")
    .digest("hex");
}

export function verifyPurposeToken(
  purpose: OtpPurpose,
  token: string,
  salt: string,
  expectedHash: string,
): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(token) || !salt || !/^[a-fA-F0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const candidate = hashPurposeToken(purpose, token.toLowerCase(), salt);
  return timingSafeStringEqual(candidate, expectedHash.toLowerCase());
}

export function verifyCronBearerToken(authHeader: string | null): boolean {
  if (!authHeader) {
    return false;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match || !match[1]) {
    return false;
  }
  const env = getEnv();
  return timingSafeStringEqual(match[1].trim(), env.CRON_SECRET);
}

export function createAttendanceToken(dateWib: string): string {
  const env = getEnv();
  return crypto
    .createHmac("sha256", env.HMAC_SECRET)
    .update(`attendance-confirm:${dateWib}`, "utf8")
    .digest("hex");
}

export function verifyAttendanceToken(dateWib: string, token: string): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(token)) {
    return false;
  }
  const expected = createAttendanceToken(dateWib);
  return timingSafeStringEqual(token.toLowerCase(), expected);
}

export function hashClientIp(ip: string): string {
  const env = getEnv();
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(`ratelimit-ip:${ip}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

interface SessionPayload {
  v: 1;
  sv: string;
  iat: number;
  exp: number;
}

function signSessionPayload(encodedPayload: string): string {
  const env = getEnv();
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

export function createSessionCookieValue(sessionVersion = "1"): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sv: sessionVersion,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signSessionPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionCookieValue(
  cookieValue: string | undefined,
  expectedSessionVersion?: string,
): {
  valid: boolean;
  exp?: number;
  sv?: string;
} {
  if (!cookieValue) {
    return { valid: false };
  }

  const parts = cookieValue.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false };
  }

  const [encodedPayload, providedSignature] = parts;
  let expectedSignature: string;
  try {
    expectedSignature = signSessionPayload(encodedPayload);
  } catch {
    return { valid: false };
  }

  if (!timingSafeStringEqual(providedSignature, expectedSignature)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      decoded.v !== 1 ||
      typeof decoded.sv !== "string" ||
      decoded.sv.length === 0 ||
      typeof decoded.exp !== "number" ||
      decoded.exp <= nowSec
    ) {
      return { valid: false };
    }
    if (expectedSessionVersion !== undefined && !timingSafeStringEqual(decoded.sv, expectedSessionVersion)) {
      return { valid: false };
    }
    return { valid: true, exp: decoded.exp, sv: decoded.sv };
  } catch {
    return { valid: false };
  }
}

export function getSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function getServerSession(): Promise<{ authenticated: boolean; exp?: number }> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) {
    return { authenticated: false };
  }

  let activeSessionVersion = "1";
  try {
    const redis = getRedis();
    const storedVersion = await redis.get<string | number>(SESSION_VERSION_REDIS_KEY);
    if (storedVersion !== null && storedVersion !== undefined && String(storedVersion).trim().length > 0) {
      activeSessionVersion = String(storedVersion).trim();
    }
  } catch {
    return { authenticated: false };
  }

  const result = verifySessionCookieValue(value, activeSessionVersion);
  return {
    authenticated: result.valid,
    exp: result.exp,
  };
}
