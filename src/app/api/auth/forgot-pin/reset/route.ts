import { NextResponse } from "next/server";
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-helpers";
import { sendPinResetSuccessEmail } from "@/lib/mailer";
import {
  AUTH_NO_STORE_HEADERS,
  hashClientIp,
  verifyOtpHmac,
} from "@/lib/security";
import {
  clearLoginRateLimit,
  deleteResetOtp,
  getActiveSenderName,
  getResetOtp,
  incrementResetOtpAttempts,
  setActivePinConfig,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";
import { forgotPinResetSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function withNoStore<T>(response: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, forgotPinResetSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const otpRecord = await getResetOtp();
    if (!otpRecord) {
      return withNoStore(
        jsonError(
          "Kode verifikasi sudah kedaluwarsa atau belum diminta.",
          "OTP_EXPIRED_OR_MISSING",
          400,
        ),
      );
    }

    const validOtp = verifyOtpHmac(parsed.data.otp, otpRecord.salt, otpRecord.otpHash);
    if (!validOtp) {
      const next = await incrementResetOtpAttempts(otpRecord);
      if (next.exhausted) {
        return withNoStore(
          jsonError(
            "Terlalu banyak percobaan salah, kode hangus. Silakan minta kode baru.",
            "OTP_ATTEMPTS_EXCEEDED",
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

    // Kode OTP valid: simpan PIN 6 digit baru, hapus OTP (single-use), clear rate limit IP, dan rotasi session_version.
    const ipHash = hashClientIp(getClientIp(request));
    await deleteResetOtp();
    await clearLoginRateLimit(ipHash);
    const { updatedAt } = await setActivePinConfig(parsed.data.newPin, "pin_reset");

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetSuccessEmail({
        resetAtWibLabel: `${getNowWibTimeLabel()} WIB`,
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
