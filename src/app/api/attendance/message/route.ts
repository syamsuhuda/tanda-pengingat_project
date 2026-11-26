import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { clearCustomMessage, setCustomMessage } from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { customMessageSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, customMessageSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const trimmed = parsed.data.message.trim();
    if (!trimmed) {
      await clearCustomMessage();
      return jsonOk("Pesan khusus pengingat berhasil dihapus.", {
        customMessage: null,
      });
    }

    const todayWib = getTodayWibDate();
    const saved = await setCustomMessage({
      message: trimmed,
      scope: parsed.data.scope,
      todayWib,
    });

    return jsonOk(
      parsed.data.scope === "today_only"
        ? "Pesan khusus disimpan untuk pengingat hari ini."
        : "Pesan khusus disimpan secara permanen sampai Anda ubah.",
      { customMessage: saved },
    );
  } catch (error) {
    return handleRouteError(error, "Gagal menyimpan pesan khusus pengingat.");
  }
}
