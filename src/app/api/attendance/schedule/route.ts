import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { setActiveSchedule } from "@/lib/store";
import { scheduleConfigSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, scheduleConfigSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const schedule = await setActiveSchedule(parsed.data);
    return jsonOk("Pengaturan jam kirim pengingat berhasil disimpan.", schedule);
  } catch (error) {
    return handleRouteError(error, "Gagal menyimpan pengaturan jadwal pengingat.");
  }
}
