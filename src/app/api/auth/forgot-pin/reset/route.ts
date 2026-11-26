import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  withNoStore,
} from "@/lib/api-helpers";
import { sendPinResetSuccessEmail } from "@/lib/mailer";
import { hashClientIp } from "@/lib/security";
import {
  clearLoginRateLimit,
  consumeVerificationTicket,
  getActiveSenderName,
  getLoginRateLimitState,
  recordFailedLoginAttempt,
  setActivePinConfig,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";
import { forgotPinResetSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);
    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Terlalu banyak percobaan reset PIN yang gagal. Coba lagi setelah 15 menit.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        ),
      );
    }

    const parsed = await parseJsonBody(request, forgotPinResetSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ticketValid = await consumeVerificationTicket(
      "forgot_reset",
      parsed.data.verificationToken,
    );
    if (!ticketValid) {
      const nextState = await recordFailedLoginAttempt(ipHash);
      if (nextState.blocked) {
        return withNoStore(
          jsonError(
            "Terlalu banyak percobaan verifikasi tidak valid. Akses diblokir sementara selama 15 menit.",
            "RATE_LIMITED",
            429,
            { remainingAttempts: 0 },
          ),
        );
      }
      return withNoStore(
        jsonError(
          "Sesi verifikasi OTP sudah habis atau tidak valid. Silakan minta dan verifikasi kode OTP baru.",
          "VERIFICATION_EXPIRED",
          401,
        ),
      );
    }

    await clearLoginRateLimit(ipHash);
    const { updatedAt } = await setActivePinConfig(parsed.data.newPin, "pin_reset");

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetSuccessEmail({
        purpose: "forgot_reset",
        resetAtWibLabel: getNowWibTimeLabel(),
        senderName,
      });
    } catch {
      // Notifikasi email tidak menggagalkan reset PIN yang sudah tersimpan aman.
    }

    return withNoStore(
      jsonOk(
        "PIN 6 digit baru berhasil disimpan. Silakan masuk menggunakan PIN baru kamu.",
        { updatedAt },
      ),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mereset PIN akses."));
  }
}
