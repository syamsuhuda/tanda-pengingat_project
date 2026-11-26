import {
  handleRouteError,
  jsonError,
  jsonOk,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { appendActivityLog, resetAttendanceStatus } from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { resetAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    let clearSentLocks = false;
    const rawText = await request.text();
    if (rawText.trim().length > 0) {
      try {
        const parsed = resetAttendanceSchema.safeParse(JSON.parse(rawText));
        if (!parsed.success) {
          return jsonError("Parameter reset tidak valid.", "VALIDATION_ERROR", 400);
        }
        clearSentLocks = parsed.data.clearSentLocks;
      } catch {
        return jsonError("Body JSON tidak valid.", "INVALID_JSON", 400);
      }
    }

    const todayWib = getTodayWibDate();
    await resetAttendanceStatus(todayWib, clearSentLocks);

    await appendActivityLog({
      type: "attendance_reset",
      summary: clearSentLocks
        ? `Status absen dan penanda kirim hari ini (${todayWib}) direset.`
        : `Status absen hari ini (${todayWib}) direset ke Belum Absen.`,
      result: "success",
    });

    return jsonOk("Status absen hari ini berhasil direset ke Belum Absen.", {
      dateWib: todayWib,
      clearSentLocks,
    });
  } catch (error) {
    return handleRouteError(error, "Gagal mereset status absen hari ini.");
  }
}
