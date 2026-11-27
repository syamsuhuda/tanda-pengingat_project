import { NextResponse } from "next/server";
import { handleRouteError, jsonError, jsonOk, withNoStore } from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/env";
import { sendAttendanceReminder, sendUrgentWithEscalation } from "@/lib/mailer";
import { createAttendanceToken } from "@/lib/security";
import {
  acquireStageProcessingLock,
  appendActivityLog,
  appendActivityLogIfNotDuplicate,
  getActiveCustomMessage,
  getActiveRecipient,
  getActiveSchedule,
  getActiveSenderName,
  getAllStageSentAt,
  getAttendanceStatus,
  getBotPauseConfig,
  isOffDay,
  recordCronPing,
  releaseStageProcessingLock,
  setStageSentLock,
  touchDashboardVersion,
} from "@/lib/store";
import {
  formatHmTimeWibLabel,
  getCurrentWibMinutes,
  getTodayWibDate,
  resolveDueAutoStage,
} from "@/lib/timezone";
import type { AttendanceStage } from "@/lib/types";

const STAGE_NAME = {
  morning: "Pagi",
  afternoon: "Sore",
  urgent: "Urgent",
} as const;

export async function executeCronAttendance(params: {
  request: Request;
  requestedStage: "auto" | AttendanceStage;
  source: string;
  trackCronPing: boolean;
}): Promise<NextResponse> {
  const { request, requestedStage, source, trackCronPing } = params;

  const pingSafe = async (status: string, stageTriggered: string | null = null) => {
    if (!trackCronPing) return;
    try {
      await recordCronPing({ status, stageTriggered, source });
    } catch {
      // Jangan menggagalkan eksekusi utama bila pencatatan telemetry ping bermasalah.
    }
  };

  try {
    const isAuto = requestedStage === "auto";
    const logSkip = isAuto ? appendActivityLogIfNotDuplicate : appendActivityLog;

    const now = new Date();
    const todayWib = getTodayWibDate(now);

    const [pauseConfig, todayOffDay, attendance] = await Promise.all([
      getBotPauseConfig(),
      isOffDay(todayWib),
      getAttendanceStatus(todayWib),
    ]);

    if (pauseConfig.paused) {
      await Promise.all([
        logSkip({
          type: "cron_skipped",
          summary: `Jadwal pengingat (${todayWib}) dilewati karena Bot Dijeda.`,
          result: "skipped",
        }),
        pingSafe("skipped_paused"),
      ]);
      return withNoStore(
        jsonOk("Jadwal dilewati karena Bot sedang Dijeda.", {
          status: "skipped_paused",
          skipped: true,
          reason: "paused",
          dateWib: todayWib,
          stage: requestedStage,
        }),
      );
    }

    if (todayOffDay.isOff) {
      await Promise.all([
        logSkip({
          type: "cron_skipped",
          summary: `Jadwal pengingat (${todayWib}) dilewati karena hari ini libur${todayOffDay.note ? ` (${todayOffDay.note})` : ""}.`,
          result: "skipped",
        }),
        pingSafe("skipped_off_day"),
      ]);
      return withNoStore(
        jsonOk("Jadwal dilewati karena hari ini terdaftar sebagai hari libur.", {
          status: "skipped_off_day",
          skipped: true,
          reason: "off_day",
          dateWib: todayWib,
          stage: requestedStage,
          ...(todayOffDay.note ? { note: todayOffDay.note } : {}),
        }),
      );
    }

    if (attendance) {
      await Promise.all([
        logSkip({
          type: "cron_skipped",
          summary: `Jadwal pengingat (${todayWib}) dibatalkan karena absen hari ini sudah dikonfirmasi.`,
          result: "skipped",
        }),
        pingSafe("skipped_confirmed"),
      ]);
      return withNoStore(
        jsonOk("Jadwal dibatalkan karena absen hari ini sudah dikonfirmasi.", {
          status: "skipped_confirmed",
          skipped: true,
          reason: "already_confirmed",
          dateWib: todayWib,
          stage: requestedStage,
          confirmedAt: attendance.confirmedAt,
        }),
      );
    }

    const [schedule, sentMap] = await Promise.all([
      getActiveSchedule(),
      getAllStageSentAt(todayWib),
    ]);

    let targetStage: AttendanceStage;

    if (isAuto) {
      const nowMinutes = getCurrentWibMinutes(now);
      const dueStage = resolveDueAutoStage(nowMinutes, schedule, sentMap);

      if (!dueStage) {
        // Tidak mencatat ke logs:activity agar 30 slot log tidak penuh oleh pengecekan rutin.
        await pingSafe("skipped_not_due");
        return withNoStore(
          jsonOk("Belum ada tahap pengingat yang masuk jendela kirim saat ini.", {
            status: "skipped_not_due",
            skipped: true,
            reason: "not_due",
            dateWib: todayWib,
            stage: "auto",
            nowMinutesWib: nowMinutes,
          }),
        );
      }

      targetStage = dueStage;
    } else {
      const alreadySentAt = sentMap[requestedStage];
      if (alreadySentAt) {
        await Promise.all([
          appendActivityLog({
            type: "cron_skipped",
            summary: `Jadwal ${STAGE_NAME[requestedStage]} (${todayWib}) dilewati karena sudah pernah dikirim.`,
            result: "skipped",
          }),
          pingSafe("skipped_duplicate", requestedStage),
        ]);
        return withNoStore(
          jsonOk("Pengingat untuk tahap ini sudah dikirim sebelumnya (idempotent).", {
            status: "skipped_duplicate",
            skipped: true,
            reason: "already_sent",
            dateWib: todayWib,
            stage: requestedStage,
            sentAt: alreadySentAt,
          }),
        );
      }

      targetStage = requestedStage;
    }

    const [recipient, activeCustomMessage, senderName] = await Promise.all([
      getActiveRecipient(),
      getActiveCustomMessage(todayWib),
      getActiveSenderName(),
    ]);

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = getAppBaseUrl(requestOrigin);
    const token = createAttendanceToken(todayWib);
    const confirmUrl = `${baseUrl}/confirm?date=${encodeURIComponent(todayWib)}&token=${encodeURIComponent(token)}`;
    const customMessageText = activeCustomMessage?.message ?? null;
    const scheduledTimeWib = formatHmTimeWibLabel(schedule[targetStage].time);

    const lockAcquired = await acquireStageProcessingLock(todayWib, targetStage, 120);
    if (!lockAcquired) {
      await pingSafe("skipped_in_progress", targetStage);
      return withNoStore(
        jsonOk("Tahap pengingat ini sedang diproses oleh eksekusi cron lain.", {
          status: "skipped_in_progress",
          skipped: true,
          reason: "in_progress",
          dateWib: todayWib,
          stage: targetStage,
          requestedStage,
        }),
      );
    }

    try {
      if (targetStage === "urgent") {
        const dispatch = await sendUrgentWithEscalation({
          dateWib: todayWib,
          recipient,
          senderName,
          confirmUrl,
          dashboardUrl: baseUrl,
          customMessage: customMessageText,
          scheduledTimeWib,
        });

        if (!dispatch.partner.ok && !dispatch.escalation.ok) {
          await releaseStageProcessingLock(todayWib, "urgent");
          await Promise.all([
            appendActivityLog({
              type: "cron_urgent",
              summary: `Gagal mengirim peringatan urgent (${scheduledTimeWib}) ke ${recipient.name} dan eskalasi (${todayWib}).`,
              result: "error",
            }),
            pingSafe("smtp_error", "urgent"),
          ]);
          return withNoStore(
            jsonError(
              "Gagal mengirim email urgent dan email eskalasi.",
              "SMTP_SEND_FAILED",
              500,
              dispatch,
            ),
          );
        }

        if (dispatch.partner.ok) {
          await setStageSentLock(todayWib, "urgent");
        }
        await releaseStageProcessingLock(todayWib, "urgent");

        const bothOk = dispatch.partner.ok && dispatch.escalation.ok;
        await Promise.all([
          appendActivityLog({
            type: "cron_urgent",
            summary: bothOk
              ? `Peringatan urgent (${scheduledTimeWib}) ke ${recipient.name} dan email eskalasi terkirim (${todayWib}).`
              : `Pengiriman urgent (${scheduledTimeWib}, ${todayWib}) berhasil sebagian (partner: ${dispatch.partner.ok ? "ok" : "gagal"}, eskalasi: ${dispatch.escalation.ok ? "ok" : "gagal"}).`,
            result: bothOk ? "success" : "partial",
          }),
          touchDashboardVersion(),
          pingSafe(bothOk ? "sent" : "partial", "urgent"),
        ]);

        return withNoStore(
          jsonOk(
            bothOk
              ? "Peringatan urgent dan email eskalasi berhasil dikirim."
              : "Pengiriman urgent selesai sebagian; cek detail hasil dan log aktivitas.",
            {
              status: bothOk ? "sent" : "partial",
              skipped: false,
              dateWib: todayWib,
              stage: targetStage,
              requestedStage,
              scheduledTimeWib,
              dispatch,
            },
            bothOk ? 200 : 207,
          ),
        );
      }

      const includeIcs = targetStage === "morning";
      let sent: { messageId: string };
      try {
        sent = await sendAttendanceReminder({
          stage: targetStage,
          dateWib: todayWib,
          recipient,
          senderName,
          confirmUrl,
          includeIcs,
          customMessage: customMessageText,
          morningScheduleTime: schedule.morning.time,
          scheduledTimeWib,
        });
      } catch {
        // Lepaskan lock dan jangan pasang sentLock agar tick berikutnya dapat mencoba ulang.
        await releaseStageProcessingLock(todayWib, targetStage);
        await Promise.all([
          appendActivityLog({
            type: targetStage === "morning" ? "cron_morning" : "cron_afternoon",
            summary: `Gagal mengirim pengingat ${STAGE_NAME[targetStage].toLowerCase()} (${scheduledTimeWib}) ke ${recipient.name} via SMTP (${todayWib}).`,
            result: "error",
          }),
          pingSafe("smtp_error", targetStage),
        ]);
        return withNoStore(
          jsonError(
            `Gagal mengirim email pengingat ${STAGE_NAME[targetStage].toLowerCase()} melalui SMTP.`,
            "SMTP_SEND_FAILED",
            500,
          ),
        );
      }

      const lockTimestamp = await setStageSentLock(todayWib, targetStage);
      await releaseStageProcessingLock(todayWib, targetStage);

      await Promise.all([
        appendActivityLog({
          type: targetStage === "morning" ? "cron_morning" : "cron_afternoon",
          summary:
            targetStage === "morning"
              ? `Pengingat pagi (${scheduledTimeWib}) + .ics terkirim ke ${recipient.name} (${todayWib}).`
              : `Pengecekan sore (${scheduledTimeWib}) terkirim ke ${recipient.name} (${todayWib}).`,
          result: "success",
        }),
        touchDashboardVersion(),
        pingSafe("sent", targetStage),
      ]);

      return withNoStore(
        jsonOk(
          `Pengingat ${STAGE_NAME[targetStage]} (${scheduledTimeWib}) berhasil dikirim ke ${recipient.name}.`,
          {
            status: "sent",
            skipped: false,
            dateWib: todayWib,
            stage: targetStage,
            requestedStage,
            scheduledTimeWib,
            sentAt: lockTimestamp,
            messageId: sent.messageId,
            includeIcs,
          },
        ),
      );
    } catch (innerError) {
      await releaseStageProcessingLock(todayWib, targetStage);
      throw innerError;
    }
  } catch (error) {
    await pingSafe("error");
    return withNoStore(handleRouteError(error, "Gagal menjalankan cron pengingat absen."));
  }
}
