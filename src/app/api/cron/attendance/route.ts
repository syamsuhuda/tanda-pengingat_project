import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/env";
import { sendAttendanceReminder, sendUrgentWithEscalation } from "@/lib/mailer";
import { createAttendanceToken, verifyCronBearerToken } from "@/lib/security";
import {
  appendActivityLog,
  getAttendanceStatus,
  getBotPauseConfig,
  getStageSentAt,
  setStageSentLock,
} from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { cronAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const STAGE_LABEL = {
  morning: "Pagi (09.00 WIB)",
  afternoon: "Sore (15.00 WIB)",
  urgent: "Urgent (20.30 WIB)",
} as const;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyCronBearerToken(authHeader)) {
      return jsonError("Header Authorization Bearer CRON_SECRET tidak valid.", "UNAUTHORIZED", 401);
    }

    const parsed = await parseJsonBody(request, cronAttendanceSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const { stage } = parsed.data;
    const todayWib = getTodayWibDate();

    const [pauseConfig, attendance, sentAt] = await Promise.all([
      getBotPauseConfig(),
      getAttendanceStatus(todayWib),
      getStageSentAt(todayWib, stage),
    ]);

    if (pauseConfig.paused) {
      await appendActivityLog({
        type: "cron_skipped",
        summary: `Jadwal ${STAGE_LABEL[stage]} (${todayWib}) dilewati karena Mode Jeda Bot aktif.`,
        result: "skipped",
      });
      return jsonOk("Jadwal dilewati karena Mode Jeda Bot aktif.", {
        skipped: true,
        reason: "paused",
        dateWib: todayWib,
        stage,
      });
    }

    if (attendance) {
      await appendActivityLog({
        type: "cron_skipped",
        summary: `Jadwal ${STAGE_LABEL[stage]} (${todayWib}) dibatalkan karena absen sudah dikonfirmasi.`,
        result: "skipped",
      });
      return jsonOk("Jadwal dibatalkan karena absen hari ini sudah dikonfirmasi.", {
        skipped: true,
        reason: "already_confirmed",
        dateWib: todayWib,
        stage,
        confirmedAt: attendance.confirmedAt,
      });
    }

    if (sentAt) {
      await appendActivityLog({
        type: "cron_skipped",
        summary: `Jadwal ${STAGE_LABEL[stage]} (${todayWib}) dilewati karena sudah pernah dikirim.`,
        result: "skipped",
      });
      return jsonOk("Pengingat untuk tahap ini sudah dikirim sebelumnya (idempotent).", {
        skipped: true,
        reason: "already_sent",
        dateWib: todayWib,
        stage,
        sentAt,
      });
    }

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = getAppBaseUrl(requestOrigin);
    const token = createAttendanceToken(todayWib);
    const confirmUrl = `${baseUrl}/confirm?date=${encodeURIComponent(todayWib)}&token=${encodeURIComponent(token)}`;

    if (stage === "urgent") {
      const dispatch = await sendUrgentWithEscalation({
        dateWib: todayWib,
        confirmUrl,
        dashboardUrl: baseUrl,
      });

      if (!dispatch.partner.ok && !dispatch.escalation.ok) {
        await appendActivityLog({
          type: "cron_urgent",
          summary: `Gagal mengirim peringatan urgent dan eskalasi (${todayWib}).`,
          result: "error",
        });
        return jsonError(
          "Gagal mengirim email urgent dan email eskalasi.",
          "SMTP_SEND_FAILED",
          500,
          dispatch,
        );
      }

      if (dispatch.partner.ok) {
        await setStageSentLock(todayWib, "urgent");
      }

      const bothOk = dispatch.partner.ok && dispatch.escalation.ok;
      await appendActivityLog({
        type: "cron_urgent",
        summary: bothOk
          ? `Peringatan urgent 20.30 WIB dan email eskalasi terkirim (${todayWib}).`
          : `Pengiriman urgent 20.30 WIB (${todayWib}) berhasil sebagian (partner: ${dispatch.partner.ok ? "ok" : "gagal"}, eskalasi: ${dispatch.escalation.ok ? "ok" : "gagal"}).`,
        result: bothOk ? "success" : "partial",
      });

      return jsonOk(
        bothOk
          ? "Peringatan urgent dan email eskalasi berhasil dikirim."
          : "Pengiriman urgent selesai sebagian; cek detail hasil dan log aktivitas.",
        {
          skipped: false,
          dateWib: todayWib,
          stage,
          dispatch,
        },
        bothOk ? 200 : 207,
      );
    }

    const includeIcs = stage === "morning";
    const sent = await sendAttendanceReminder({
      stage,
      dateWib: todayWib,
      confirmUrl,
      includeIcs,
    });

    const lockTimestamp = await setStageSentLock(todayWib, stage);

    await appendActivityLog({
      type: stage === "morning" ? "cron_morning" : "cron_afternoon",
      summary:
        stage === "morning"
          ? `Pengingat pagi 09.00 WIB + undangan kalender (.ics) terkirim (${todayWib}).`
          : `Pengecekan sore 15.00 WIB terkirim tanpa duplikat .ics (${todayWib}).`,
      result: "success",
    });

    return jsonOk(`Pengingat ${STAGE_LABEL[stage]} berhasil dikirim.`, {
      skipped: false,
      dateWib: todayWib,
      stage,
      sentAt: lockTimestamp,
      messageId: sent.messageId,
      includeIcs,
    });
  } catch (error) {
    return handleRouteError(error, "Gagal menjalankan cron pengingat absen.");
  }
}
