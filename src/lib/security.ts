import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";

export const SESSION_COOKIE_NAME = "pj_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 hari

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

export function createSessionCookieValue(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signSessionPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionCookieValue(cookieValue: string | undefined): {
  valid: boolean;
  exp?: number;
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
    if (decoded.v !== 1 || typeof decoded.exp !== "number" || decoded.exp <= nowSec) {
      return { valid: false };
    }
    return { valid: true, exp: decoded.exp };
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
  const result = verifySessionCookieValue(value);
  return {
    authenticated: result.valid,
    exp: result.exp,
  };
}
