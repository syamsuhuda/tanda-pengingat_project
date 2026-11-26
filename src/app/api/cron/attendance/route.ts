import { handleRouteError, jsonError, jsonOk } from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/env";
import { sendAttendanceReminder, sendUrgentWithEscalation } from "@/lib/mailer";
import { createAttendanceToken, verifyCronBearerToken } from "@/lib/security";
import {
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
  setStageSentLock,
} from "@/lib/store";
import {
  formatHmTimeWibLabel,
  getCurrentWibMinutes,
  getTodayWibDate,
  resolveDueAutoStage,
} from "@/lib/timezone";
import type { AttendanceStage } from "@/lib/types";
import { cronAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const STAGE_NAME = {
  morning: "Pagi",
  afternoon: "Sore",
  urgent: "Urgent",
} as const;

async function resolveRequestedStage(
  request: Request,
): Promise<
  | { ok: true; stage: "auto" | AttendanceStage }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  const queryStage = new URL(request.url).searchParams.get("stage")?.trim();
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    const parsed = cronAttendanceSchema.safeParse(queryStage ? { stage: queryStage } : {});
    if (!parsed.success) {
      return {
        ok: false,
        response: jsonError(
          "Parameter stage harus berupa auto, morning, afternoon, atau urgent.",
          "VALIDATION_ERROR",
          400,
        ),
      };
    }
    return { ok: true, stage: parsed.data.stage };
  }

  let bodyObj: unknown;
  try {
    bodyObj = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: jsonError("Payload JSON tidak valid.", "INVALID_JSON", 400),
    };
  }

  const parsed = cronAttendanceSchema.safeParse(bodyObj);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        parsed.error.issues[0]?.message ?? "Parameter stage tidak valid.",
        "VALIDATION_ERROR",
        400,
      ),
    };
  }

  return { ok: true, stage: parsed.data.stage };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!verifyCronBearerToken(authHeader)) {
      return jsonError("Header Authorization Bearer CRON_SECRET tidak valid.", "UNAUTHORIZED", 401);
    }

    const stageResult = await resolveRequestedStage(request);
    if (!stageResult.ok) {
      return stageResult.response;
    }

    const requestedStage = stageResult.stage;
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
      await logSkip({
        type: "cron_skipped",
        summary: `Jadwal pengingat (${todayWib}) dilewati karena Mode Jeda Bot aktif.`,
        result: "skipped",
      });
      return jsonOk("Jadwal dilewati karena Mode Jeda Bot aktif.", {
        status: "skipped_paused",
        skipped: true,
        reason: "paused",
        dateWib: todayWib,
        stage: requestedStage,
      });
    }

    if (todayOffDay.isOff) {
      await logSkip({
        type: "cron_skipped",
        summary: `Jadwal pengingat (${todayWib}) dilewati karena hari ini libur${todayOffDay.note ? ` (${todayOffDay.note})` : ""}.`,
        result: "skipped",
      });
      return jsonOk("Jadwal dilewati karena hari ini terdaftar sebagai hari libur.", {
        status: "skipped_off_day",
        skipped: true,
        reason: "off_day",
        dateWib: todayWib,
        stage: requestedStage,
        ...(todayOffDay.note ? { note: todayOffDay.note } : {}),
      });
    }

    if (attendance) {
      await logSkip({
        type: "cron_skipped",
        summary: `Jadwal pengingat (${todayWib}) dibatalkan karena absen hari ini sudah dikonfirmasi.`,
        result: "skipped",
      });
      return jsonOk("Jadwal dibatalkan karena absen hari ini sudah dikonfirmasi.", {
        status: "skipped_confirmed",
        skipped: true,
        reason: "already_confirmed",
        dateWib: todayWib,
        stage: requestedStage,
        confirmedAt: attendance.confirmedAt,
      });
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
        // Tidak mencatat ke logs:activity agar 30 slot log tidak penuh oleh pengecekan rutin 30 menit.
        return jsonOk("Belum ada tahap pengingat yang masuk jendela kirim saat ini.", {
          status: "skipped_not_due",
          skipped: true,
          reason: "not_due",
          dateWib: todayWib,
          stage: "auto",
          nowMinutesWib: nowMinutes,
        });
      }

      targetStage = dueStage;
    } else {
      const alreadySentAt = sentMap[requestedStage];
      if (alreadySentAt) {
        await appendActivityLog({
          type: "cron_skipped",
          summary: `Jadwal ${STAGE_NAME[requestedStage]} (${todayWib}) dilewati karena sudah pernah dikirim.`,
          result: "skipped",
        });
        return jsonOk("Pengingat untuk tahap ini sudah dikirim sebelumnya (idempotent).", {
          status: "skipped_duplicate",
          skipped: true,
          reason: "already_sent",
          dateWib: todayWib,
          stage: requestedStage,
          sentAt: alreadySentAt,
        });
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
        await appendActivityLog({
          type: "cron_urgent",
          summary: `Gagal mengirim peringatan urgent (${scheduledTimeWib}) ke ${recipient.name} dan eskalasi (${todayWib}).`,
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
          ? `Peringatan urgent (${scheduledTimeWib}) ke ${recipient.name} dan email eskalasi terkirim (${todayWib}).`
          : `Pengiriman urgent (${scheduledTimeWib}, ${todayWib}) berhasil sebagian (partner: ${dispatch.partner.ok ? "ok" : "gagal"}, eskalasi: ${dispatch.escalation.ok ? "ok" : "gagal"}).`,
        result: bothOk ? "success" : "partial",
      });

      return jsonOk(
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
      );
    }

    const includeIcs = targetStage === "morning";
    const sent = await sendAttendanceReminder({
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

    const lockTimestamp = await setStageSentLock(todayWib, targetStage);

    await appendActivityLog({
      type: targetStage === "morning" ? "cron_morning" : "cron_afternoon",
      summary:
        targetStage === "morning"
          ? `Pengingat pagi (${scheduledTimeWib}) + .ics terkirim ke ${recipient.name} (${todayWib}).`
          : `Pengecekan sore (${scheduledTimeWib}) terkirim ke ${recipient.name} (${todayWib}).`,
      result: "success",
    });

    return jsonOk(`Pengingat ${STAGE_NAME[targetStage]} (${scheduledTimeWib}) berhasil dikirim ke ${recipient.name}.`, {
      status: "sent",
      skipped: false,
      dateWib: todayWib,
      stage: targetStage,
      requestedStage,
      scheduledTimeWib,
      sentAt: lockTimestamp,
      messageId: sent.messageId,
      includeIcs,
    });
  } catch (error) {
    return handleRouteError(error, "Gagal menjalankan cron pengingat absen.");
  }
}
