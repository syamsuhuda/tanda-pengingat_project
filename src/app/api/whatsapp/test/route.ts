import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
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
    const defaultMessage = [
      "*Tes Koneksi WhatsApp Gateway*",
      "Pesan ini dikirim dari dashboard *Pengingat Jadwal* untuk memastikan jalur Vercel -> VPS -> WhatsApp aktif.",
      `Waktu server: ${getNowWibTimeLabel()}`,
    ].join("\n\n");

    const result = await sendWhatsAppMessage(to, message ?? defaultMessage);
    if (!result.ok) {
      return withNoStore(
        jsonError(
          result.error ?? "Gagal mengirim pesan tes WhatsApp.",
          "WHATSAPP_SEND_FAILED",
          502,
          result,
        ),
      );
    }

    return withNoStore(
      jsonOk(`Pesan tes WhatsApp berhasil dikirim ke ${result.to}.`, result),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal mengirim pesan tes WhatsApp."));
  }
}
