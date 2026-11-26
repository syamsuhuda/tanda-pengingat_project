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
  setActivePinConfig,
} from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";
import { forgotPinResetSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, forgotPinResetSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const ticketValid = await consumeVerificationTicket(
      "forgot_reset",
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
    await clearLoginRateLimit(ipHash);
    const { updatedAt } = await setActivePinConfig(parsed.data.newPin, "pin_reset");

    try {
      const senderName = await getActiveSenderName();
      await sendPinResetSuccessEmail({
        purpose: "forgot_reset",
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
