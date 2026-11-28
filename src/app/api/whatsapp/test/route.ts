import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { appendActivityLog, getActiveRecipient } from "@/lib/store";
import { getNowWibTimeLabel } from "@/lib/timezone";
import { whatsappTestSchema } from "@/lib/validators";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, whatsappTestSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const { to, message } = parsed.data;
    const recipient = await getActiveRecipient();
    const targetPhone = to ?? recipient.whatsapp ?? "";

    if (!targetPhone) {
      return withNoStore(
        jsonError(
          "Nomor WhatsApp tujuan belum diisi. Masukkan nomor di kolom Nomor WhatsApp terlebih dahulu.",
          "WHATSAPP_RECIPIENT_MISSING",
          400,
        ),
      );
    }

    const defaultMessage = `Halo! Ini pesan tes dari Pengingat Jadwal untuk memastikan bot WhatsApp aktif. (${getNowWibTimeLabel()})`;
    const result = await sendWhatsAppMessage(targetPhone, message ?? defaultMessage);

    if (!result.ok) {
      await appendActivityLog({
        type: "health_checked",
        summary: `Tes kirim WhatsApp ke ${result.to} gagal: ${result.error ?? "Gateway tidak merespons"}.`,
        result: "error",
      });

      return withNoStore(
        jsonError(
          result.error ?? "Gagal mengirim pesan tes WhatsApp.",
          "WHATSAPP_SEND_FAILED",
          502,
          result,
        ),
      );
    }

    await appendActivityLog({
      type: "health_checked",
      summary: `Tes kirim WhatsApp ke ${result.to} berhasil.`,
      result: "success",
    });

    return withNoStore(
      jsonOk(`Pesan tes WhatsApp berhasil dikirim ke ${result.to}.`, result),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mengirim pesan tes WhatsApp."));
  }
}
