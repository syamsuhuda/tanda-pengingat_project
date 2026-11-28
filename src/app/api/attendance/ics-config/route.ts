import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { setActiveIcsConfig, touchDashboardVersion } from "@/lib/store";
import { attendanceIcsConfigSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const parsed = await parseJsonBody(request, attendanceIcsConfigSchema);
    if (!parsed.success) {
      return withNoStore(parsed.response);
    }

    const updated = await setActiveIcsConfig(parsed.data);
    await touchDashboardVersion();

    return withNoStore(
      jsonOk("Pengaturan undangan kalender (.ics) berhasil disimpan.", updated),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal menyimpan pengaturan kalender .ics."));
  }
}
