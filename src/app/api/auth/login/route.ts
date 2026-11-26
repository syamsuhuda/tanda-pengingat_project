import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-helpers";
import {
  createSessionCookieValue,
  getSessionCookieOptions,
  hashClientIp,
  verifyPin,
} from "@/lib/security";
import {
  clearLoginRateLimit,
  getLoginRateLimitState,
  recordFailedLoginAttempt,
} from "@/lib/store";
import { loginSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, loginSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);

    if (rateState.blocked) {
      return jsonError(
        "Terlalu banyak percobaan PIN gagal. Silakan coba lagi setelah 15 menit.",
        "RATE_LIMITED",
        429,
        { remainingAttempts: 0 },
      );
    }

    const isValid = verifyPin(parsed.data.pin);
    if (!isValid) {
      const nextState = await recordFailedLoginAttempt(ipHash);
      if (nextState.blocked) {
        return jsonError(
          "PIN salah. Akses login diblokir sementara selama 15 menit setelah 5 kali gagal.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        );
      }

      return jsonError(
        `PIN tidak sesuai. Sisa percobaan: ${nextState.remainingAttempts} kali.`,
        "INVALID_PIN",
        401,
        { remainingAttempts: nextState.remainingAttempts },
      );
    }

    await clearLoginRateLimit(ipHash);

    const cookieValue = createSessionCookieValue();
    const response = jsonOk("Berhasil masuk ke dashboard.");
    response.cookies.set({
      ...getSessionCookieOptions(),
      value: cookieValue,
    });

    return response;
  } catch (error) {
    return handleRouteError(error, "Gagal memproses autentikasi login.");
  }
}
