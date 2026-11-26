import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
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
    const parsed = await parseJsonBody(request, verifyOtpSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getLoginRateLimitState(ipHash);
    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Terlalu banyak percobaan gagal dari perangkat ini. Silakan coba lagi setelah 15 menit.",
          "RATE_LIMITED",
          429,
          { remainingAttempts: 0 },
        ),
      );
    }

    const otpRecord = await getPurposeOtp("forgot_reset");
    if (!otpRecord) {
      return withNoStore(
        jsonError(
          "Kode verifikasi sudah kedaluwarsa atau belum diminta.",
          "OTP_EXPIRED",
          400,
        ),
      );
    }

    const validOtp = verifyOtpHmac(parsed.data.otp, otpRecord.salt, otpRecord.otpHash);
    if (!validOtp) {
      const next = await incrementPurposeOtpAttempts("forgot_reset", otpRecord);
      await recordFailedLoginAttempt(ipHash);
      if (next.exhausted) {
        return withNoStore(
          jsonError(
            "Terlalu banyak percobaan salah, kode hangus. Silakan minta kode baru.",
            "OTP_LOCKED",
            429,
            { remainingAttempts: 0 },
          ),
        );
      }

      return withNoStore(
        jsonError(
          `Kode verifikasi tidak cocok. Sisa percobaan: ${next.remainingAttempts} kali.`,
          "INVALID_OTP",
          401,
          { remainingAttempts: next.remainingAttempts },
        ),
      );
    }

    const ticket = await issueVerificationTicket("forgot_reset");
    return withNoStore(
      jsonOk("Kode OTP terverifikasi. Silakan buat PIN 6 digit baru.", {
        verified: true,
        verificationToken: ticket.verificationToken,
        expiresInSeconds: ticket.expiresInSeconds,
      }),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal memverifikasi kode OTP."));
  }
}
