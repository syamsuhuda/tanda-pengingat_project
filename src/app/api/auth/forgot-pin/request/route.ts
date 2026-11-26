import crypto from "node:crypto";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
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
    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getOtpRateLimitState("forgot_reset", ipHash);

    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Batas permintaan kode pemulihan tercapai (maksimal 3 kali per 15 menit). Coba lagi nanti.",
          "FORGOT_PIN_RATE_LIMITED",
          429,
        ),
      );
    }

    const cooldownRemaining = await getOtpCooldownRemaining("forgot_reset");
    if (cooldownRemaining > 0) {
      return withNoStore(
        jsonError(
          `Tunggu ${cooldownRemaining} detik sebelum meminta kode pemulihan baru.`,
          "FORGOT_PIN_COOLDOWN",
          429,
          { retryAfterSeconds: cooldownRemaining },
        ),
      );
    }

    const otp = generateNumericOtp6();
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = hashOtpHmac(otp, salt);

    await savePurposeOtp("forgot_reset", otpHash, salt);
    await setOtpCooldown("forgot_reset");

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetOtpEmail({
        purpose: "forgot_reset",
        otp,
        requestedAtWibLabel: `${getNowWibTimeLabel()} WIB`,
        senderName,
      });
    } catch (mailError) {
      await Promise.allSettled([
        deletePurposeOtp("forgot_reset"),
        clearOtpCooldown("forgot_reset"),
      ]);
      throw mailError;
    }

    await recordOtpRequest("forgot_reset", ipHash);

    return withNoStore(
      jsonOk(
        "Kode pemulihan 6 digit telah dikirim ke email pemilik terdaftar. Berlaku selama 10 menit.",
        {
          cooldownSeconds: AUTH_OTP_COOLDOWN_SECONDS,
          otpExpiresInSeconds: AUTH_OTP_TTL_SECONDS,
        },
      ),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mengirim kode pemulihan PIN."));
  }
}
