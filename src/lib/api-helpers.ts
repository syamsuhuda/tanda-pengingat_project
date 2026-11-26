import { NextResponse } from "next/server";
import type { z } from "zod";
import { EnvConfigurationError } from "./env";
import { getServerSession } from "./security";
import type { ApiResponse } from "./types";

export function jsonOk<T>(message: string, data?: T, status = 200): NextResponse<ApiResponse<T>> {
  const payload: ApiResponse<T> = {
    ok: true,
    message,
    ...(data !== undefined ? { data } : {}),
  };
  return NextResponse.json(payload, { status });
}

export function jsonError<T = undefined>(
  message: string,
  error: string,
  status = 400,
  data?: T,
): NextResponse<ApiResponse<T>> {
  const payload: ApiResponse<T> = {
    ok: false,
    message,
    error,
    ...(data !== undefined ? { data } : {}),
  };
  return NextResponse.json(payload, { status });
}

export async function requireAuthenticatedSession(): Promise<NextResponse<ApiResponse> | null> {
  const session = await getServerSession();
  if (!session.authenticated) {
    return jsonError("Sesi tidak valid atau telah berakhir. Silakan masuk kembali.", "UNAUTHORIZED", 401);
  }
  return null;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

const MAX_JSON_BODY_BYTES = 64 * 1024; // 64 KB batas aman payload JSON

export function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<
  | { success: true; data: z.output<TSchema> }
  | { success: false; response: NextResponse<ApiResponse> }
> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
      return {
        success: false,
        response: jsonError("Ukuran payload terlalu besar (maksimal 64 KB).", "PAYLOAD_TOO_LARGE", 413),
      };
    }
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      success: false,
      response: jsonError("Gagal membaca payload permintaan.", "INVALID_JSON", 400),
    };
  }

  if (Buffer.byteLength(rawText, "utf8") > MAX_JSON_BODY_BYTES) {
    return {
      success: false,
      response: jsonError("Ukuran payload terlalu besar (maksimal 64 KB).", "PAYLOAD_TOO_LARGE", 413),
    };
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return {
      success: false,
      response: jsonError("Payload JSON tidak valid atau kosong.", "INVALID_JSON", 400),
    };
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const message = firstIssue?.message ?? "Input tidak memenuhi validasi.";
    return {
      success: false,
      response: jsonError(message, "VALIDATION_ERROR", 400),
    };
  }

  return { success: true, data: parsed.data };
}

export function handleRouteError(
  error: unknown,
  fallbackMessage: string,
): NextResponse<ApiResponse> {
  if (error instanceof EnvConfigurationError) {
    return jsonError(error.message, "ENV_NOT_CONFIGURED", 500);
  }

  if (error instanceof Error && error.message === "DUPLICATE_CONTACT_EMAIL") {
    return jsonError("Alamat email tersebut sudah tersimpan di daftar kontak.", "DUPLICATE_EMAIL", 409);
  }

  if (error instanceof Error && error.name === "SmtpNoAcceptedRecipientsError") {
    return jsonError(error.message, "SMTP_DELIVERY_REJECTED", 502);
  }

  const detail = error instanceof Error ? error.message : "Terjadi kesalahan internal.";
  console.error(`[API Error] ${fallbackMessage}:`, detail);
  return jsonError(fallbackMessage, "INTERNAL_ERROR", 500);
}
