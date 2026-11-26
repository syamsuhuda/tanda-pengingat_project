import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { appendActivityLog, setBotPauseConfig } from "@/lib/store";
import { pauseConfigSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, pauseConfigSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const config = await setBotPauseConfig(parsed.data.paused, parsed.data.note);

    await appendActivityLog({
      type: "bot_pause",
      summary: config.paused
        ? `Mode Jeda Bot diaktifkan${config.note ? ` (${config.note})` : ""}.`
        : "Mode Jeda Bot dinonaktifkan; jadwal otomatis kembali berjalan.",
      result: "success",
    });

    return jsonOk(
      config.paused
        ? "Mode Jeda Bot aktif. Jadwal otomatis dihentikan sementara."
        : "Mode Jeda Bot dimatikan. Jadwal otomatis kembali aktif.",
      config,
    );
  } catch (error) {
    return handleRouteError(error, "Gagal memperbarui konfigurasi Mode Jeda Bot.");
  }
}
