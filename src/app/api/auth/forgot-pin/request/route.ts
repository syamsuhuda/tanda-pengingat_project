import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api-helpers";
import { sendPinResetOtpEmail } from "@/lib/mailer";
import {
  AUTH_NO_STORE_HEADERS,
  generateNumericOtp6,
  hashClientIp,
  hashOtpHmac,
} from "@/lib/security";
import {
  getActiveSenderName,
  getForgotPinCooldownRemaining,
  getForgotPinRateLimitState,
  recordForgotPinRequest,
  saveResetOtp,
  setForgotPinCooldown,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export async function POST(request: Request) {
  try {
    const ipHash = hashClientIp(getClientIp(request));
    const rateState = await getForgotPinRateLimitState(ipHash);

    if (rateState.blocked) {
      return withNoStore(
        jsonError(
          "Batas permintaan kode pemulihan tercapai (maksimal 3 kali per 15 menit). Coba lagi nanti.",
          "FORGOT_PIN_RATE_LIMITED",
          429,
        ),
      );
    }

    const cooldownRemaining = await getForgotPinCooldownRemaining();
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

    await saveResetOtp(otpHash, salt);
    await setForgotPinCooldown();
    await recordForgotPinRequest(ipHash);

    const senderName = await getActiveSenderName();
    await sendPinResetOtpEmail({
      otp,
      requestedAtWibLabel: `${getNowWibTimeLabel()} WIB`,
      senderName,
    });

    return withNoStore(
      jsonOk(
        "Kode pemulihan 6 digit telah dikirim ke email pemilik terdaftar. Berlaku selama 10 menit.",
        { cooldownSeconds: 60 },
      ),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mengirim kode pemulihan PIN."));
  }
}
