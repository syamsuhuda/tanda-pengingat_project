import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { sendPinResetSuccessEmail } from "@/lib/mailer";
import {
  createSessionCookieValue,
  getSessionCookieOptions,
  hashClientIp,
} from "@/lib/security";
import {
  clearLoginRateLimit,
  deleteVerificationTicket,
  getActiveSenderName,
  getLoginRateLimitState,
  recordFailedLoginAttempt,
  setActivePinConfig,
  verifyActivePin,
  verifyVerificationTicket,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";
import { changePinSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

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

    const ticketValid = await verifyVerificationTicket(
      "change_pin",
      parsed.data.verificationToken,
    );
    if (!ticketValid) {
      return withNoStore(
        jsonError(
          "Sesi verifikasi OTP sudah habis atau tidak valid. Silakan minta dan verifikasi kode OTP baru.",
          "VERIFICATION_EXPIRED",
          401,
        ),
      );
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

    // Konsumsi tiket sekali pakai secara atomik hanya setelah seluruh verifikasi (termasuk PIN saat ini) lulus.
    const consumed = await deleteVerificationTicket("change_pin");
    if (!consumed) {
      return withNoStore(
        jsonError(
          "Sesi verifikasi OTP sudah digunakan atau habis. Silakan minta dan verifikasi kode OTP baru.",
          "VERIFICATION_EXPIRED",
          401,
        ),
      );
    }
    await clearLoginRateLimit(ipHash);

    const { sessionVersion, updatedAt } = await setActivePinConfig(parsed.data.newPin, "pin_updated");
    const cookieValue = createSessionCookieValue(sessionVersion);

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetSuccessEmail({
        purpose: "change_pin",
        resetAtWibLabel: getNowWibTimeLabel(),
        senderName,
      });
    } catch {
      // Notifikasi email tidak menggagalkan pembaruan PIN yang sudah tersimpan aman.
    }

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
