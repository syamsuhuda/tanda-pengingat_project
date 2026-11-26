import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/env";
import { sendAttendanceReminder } from "@/lib/mailer";
import { createAttendanceToken } from "@/lib/security";
import { appendActivityLog, getAttendanceStatus } from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { triggerAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, triggerAttendanceSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const { note, includeIcs, forceSend } = parsed.data;
    const todayWib = getTodayWibDate();
    const existingStatus = await getAttendanceStatus(todayWib);

    if (existingStatus && !forceSend) {
      return jsonError(
        "Status absen hari ini sudah tercatat terkonfirmasi. Konfirmasi kirim ulang jika tetap ingin mengirim pengingat.",
        "ALREADY_CONFIRMED",
        409,
        { confirmedAt: existingStatus.confirmedAt },
      );
    }

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = getAppBaseUrl(requestOrigin);
    const token = createAttendanceToken(todayWib);
    const confirmUrl = `${baseUrl}/confirm?date=${encodeURIComponent(todayWib)}&token=${encodeURIComponent(token)}`;

    const sent = await sendAttendanceReminder({
      stage: "manual",
      dateWib: todayWib,
      confirmUrl,
      includeIcs,
      note,
    });

    await appendActivityLog({
      type: "manual_reminder",
      summary: `Pengingat manual dikirim (${todayWib}${includeIcs ? ", dengan .ics" : ", tanpa .ics"}${forceSend && existingStatus ? ", paksa kirim ulang" : ""}).`,
      result: "success",
    });

    return jsonOk("Pengingat absen manual berhasil dikirim.", {
      dateWib: todayWib,
      includeIcs,
      messageId: sent.messageId,
    });
  } catch (error) {
    return handleRouteError(error, "Gagal mengirim pengingat absen manual.");
  }
}
