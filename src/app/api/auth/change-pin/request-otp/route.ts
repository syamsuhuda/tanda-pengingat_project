import crypto from "node:crypto";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { sendPinResetOtpEmail } from "@/lib/mailer";
import { generateNumericOtp6, hashClientIp, hashOtpHmac } from "@/lib/security";
import {
  AUTH_OTP_COOLDOWN_SECONDS,
  AUTH_OTP_TTL_SECONDS,
  clearOtpCooldown,
  deletePurposeOtp,
  getActiveSenderName,
  getOtpCooldownRemaining,
  getOtpRateLimitState,
  recordOtpRequest,
  savePurposeOtp,
  setOtpCooldown,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getOtpRateLimitState("change_pin", ipHash);
    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Batas permintaan OTP ubah PIN tercapai (maksimal 3 kali per 15 menit). Coba lagi nanti.",
          "CHANGE_PIN_RATE_LIMITED",
          429,
        ),
      );
    }

    const cooldownRemaining = await getOtpCooldownRemaining("change_pin");
    if (cooldownRemaining > 0) {
      return withNoStore(
        jsonError(
          `Tunggu ${cooldownRemaining} detik sebelum meminta kode OTP baru.`,
          "CHANGE_PIN_COOLDOWN",
          429,
          { retryAfterSeconds: cooldownRemaining },
        ),
      );
    }

    const otp = generateNumericOtp6();
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = hashOtpHmac(otp, salt);

    await savePurposeOtp("change_pin", otpHash, salt);
    await setOtpCooldown("change_pin");

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetOtpEmail({
        purpose: "change_pin",
        otp,
        requestedAtWibLabel: `${getNowWibTimeLabel()} WIB`,
        senderName,
      });
    } catch (mailError) {
      await Promise.allSettled([
        deletePurposeOtp("change_pin"),
        clearOtpCooldown("change_pin"),
      ]);
      throw mailError;
    }

    await recordOtpRequest("change_pin", ipHash);

    return withNoStore(
      jsonOk(
        "Kode OTP 6 digit untuk ubah PIN telah dikirim ke email pemilik terdaftar. Berlaku selama 10 menit.",
        {
          cooldownSeconds: AUTH_OTP_COOLDOWN_SECONDS,
          otpExpiresInSeconds: AUTH_OTP_TTL_SECONDS,
        },
      ),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mengirim kode OTP ubah PIN."));
  }
}
