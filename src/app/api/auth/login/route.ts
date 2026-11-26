import { NextResponse } from "next/server";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-helpers";
import {
  AUTH_NO_STORE_HEADERS,
  createSessionCookieValue,
  getSessionCookieOptions,
  hashClientIp,
} from "@/lib/security";
import {
  clearLoginRateLimit,
  getLoginRateLimitState,
  getSessionVersion,
  recordFailedLoginAttempt,
  verifyActivePin,
} from "@/lib/store";
import { loginSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, loginSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);

    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Terlalu banyak percobaan PIN gagal. Silakan coba lagi setelah 15 menit.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        ),
      );
    }

    const pinCheck = await verifyActivePin(parsed.data.pin);
    if (pinCheck.usesCustomPin && !/^\d{6}$/.test(parsed.data.pin)) {
      return withNoStore(
        jsonError("PIN harus tepat 6 digit angka.", "INVALID_PIN_FORMAT", 400),
      );
    }

    if (!pinCheck.valid) {
      const nextState = await recordFailedLoginAttempt(ipHash);
      if (nextState.blocked) {
        return withNoStore(
          jsonError(
            "PIN salah. Akses login diblokir sementara selama 15 menit setelah 5 kali gagal.",
            "RATE_LIMITED",
            429,
            { remainingAttempts: 0 },
          ),
        );
      }

      return withNoStore(
        jsonError(
          `PIN tidak sesuai. Sisa percobaan: ${nextState.remainingAttempts} kali.`,
          "INVALID_PIN",
          401,
          { remainingAttempts: nextState.remainingAttempts },
        ),
      );
    }

    await clearLoginRateLimit(ipHash);

    const sessionVersion = await getSessionVersion();
    const cookieValue = createSessionCookieValue(sessionVersion);
    const response = withNoStore(jsonOk("Berhasil masuk ke dashboard."));
    response.cookies.set({
      ...getSessionCookieOptions(),
      value: cookieValue,
    });

    return response;
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal memproses autentikasi login."));
  }
}
