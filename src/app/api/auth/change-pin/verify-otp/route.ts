import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { hashClientIp, verifyOtpHmac } from "@/lib/security";
import {
  getLoginRateLimitState,
  getPurposeOtp,
  incrementPurposeOtpAttempts,
  issueVerificationTicket,
  recordFailedLoginAttempt,
} from "@/lib/store";
import { verifyOtpSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const parsed = await parseJsonBody(request, verifyOtpSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);
    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Terlalu banyak percobaan gagal dari perangkat ini. Coba lagi setelah 15 menit.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        ),
      );
    }

    const otpRecord = await getPurposeOtp("change_pin");
    if (!otpRecord) {
      return withNoStore(
        jsonError(
          "Kode OTP sudah kedaluwarsa atau belum diminta.",
          "OTP_EXPIRED",
          400,
        ),
      );
    }

    const validOtp = verifyOtpHmac(parsed.data.otp, otpRecord.salt, otpRecord.otpHash);
    if (!validOtp) {
      const next = await incrementPurposeOtpAttempts("change_pin", otpRecord);
      await recordFailedLoginAttempt(ipHash);
      if (next.exhausted) {
        return withNoStore(
          jsonError(
            "Terlalu banyak percobaan salah, kode hangus. Silakan minta kode OTP baru.",
            "OTP_LOCKED",
            429,
            { remainingAttempts: 0 },
          ),
        );
      }

      return withNoStore(
        jsonError(
          `Kode OTP tidak cocok. Sisa percobaan: ${next.remainingAttempts} kali.`,
          "INVALID_OTP",
          401,
          { remainingAttempts: next.remainingAttempts },
        ),
      );
    }

    const ticket = await issueVerificationTicket("change_pin");
    return withNoStore(
      jsonOk("OTP terverifikasi. Silakan masukkan PIN saat ini dan PIN 6 digit baru.", {
        verified: true,
        verificationToken: ticket.verificationToken,
        expiresInSeconds: ticket.expiresInSeconds,
      }),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal memverifikasi kode OTP ubah PIN."));
  }
}
