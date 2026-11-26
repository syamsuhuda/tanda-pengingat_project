import { NextResponse } from "next/server";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
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
  recordFailedLoginAttempt,
  setActivePinConfig,
  verifyActivePin,
} from "@/lib/store";
import { changePinSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const parsed = await parseJsonBody(request, changePinSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);
    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Terlalu banyak percobaan PIN saat ini gagal. Coba lagi setelah 15 menit.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        ),
      );
    }

    const pinCheck = await verifyActivePin(parsed.data.currentPin);
    if (!pinCheck.valid) {
      const nextState = await recordFailedLoginAttempt(ipHash);
      if (nextState.blocked) {
        return withNoStore(
          jsonError(
            "PIN saat ini salah. Percobaan diblokir sementara selama 15 menit.",
            "RATE_LIMITED",
            429,
            { remainingAttempts: 0 },
          ),
        );
      }
      return withNoStore(
        jsonError(
          `PIN saat ini tidak sesuai. Sisa percobaan: ${nextState.remainingAttempts} kali.`,
          "INVALID_CURRENT_PIN",
          401,
          { remainingAttempts: nextState.remainingAttempts },
        ),
      );
    }

    await clearLoginRateLimit(ipHash);

    const { sessionVersion, updatedAt } = await setActivePinConfig(parsed.data.newPin, "pin_updated");
    const cookieValue = createSessionCookieValue(sessionVersion);
    const response = withNoStore(
      jsonOk(
        "PIN akses 6 digit berhasil diperbarui. Sesi di perangkat lain otomatis dikeluarkan.",
        { updatedAt },
      ),
    );
    response.cookies.set({
      ...getSessionCookieOptions(),
      value: cookieValue,
    });

    return response;
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal memperbarui PIN akses."));
  }
}
