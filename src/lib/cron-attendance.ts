import { NextResponse } from "next/server";
import { handleRouteError, jsonError, jsonOk, withNoStore } from "@/lib/api-helpers";
import { getAppBaseUrl } from "@/lib/env";
import { sendAttendanceReminder, sendUrgentWithEscalation } from "@/lib/mailer";
import { createAttendanceToken } from "@/lib/security";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { buildAttendanceReminderWhatsApp } from "@/lib/whatsapp-templates";
import {
  acquireStageProcessingLock,
  appendActivityLog,
  appendActivityLogIfNotDuplicate,
  clearBotHealthError,
  getActiveCustomMessage,
  getActiveIcsConfig,
  getActiveRecipient,
  getActiveSchedule,
  getActiveSenderName,
  getAllStageSentAt,
  getAttendanceStatus,
  getBotPauseConfig,
  isOffDay,
  recordBotHealthError,
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

    const [schedule, sentMap, icsConfig] = await Promise.all([
      getActiveSchedule(),
      getAllStageSentAt(todayWib),
      getActiveIcsConfig(),
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

    const activeChannel = recipient.channel ?? "email";
    const hasWaNumber = Boolean(recipient.whatsapp);
    const shouldSendWa = (activeChannel === "whatsapp" || activeChannel === "both") && hasWaNumber;
    const shouldSendEmail = activeChannel === "email" || activeChannel === "both" || !shouldSendWa;

    try {
      if (targetStage === "urgent") {
        const waPromise = shouldSendWa && recipient.whatsapp
          ? sendWhatsAppMessage(
              recipient.whatsapp,
              buildAttendanceReminderWhatsApp({
                stage: "urgent",
                dateWib: todayWib,
                recipientName: recipient.name,
                senderName,
                confirmUrl,
                customMessage: customMessageText,
                scheduledTimeWib,
              }),
            )
          : Promise.resolve(null);

        const emailPromise = shouldSendEmail
          ? sendUrgentWithEscalation({
              dateWib: todayWib,
              recipient,
              senderName,
              confirmUrl,
              dashboardUrl: baseUrl,
              includeIcs: icsConfig.enabledStages.urgent,
              icsConfig,
              customMessage: customMessageText,
              scheduledTimeWib,
            })
          : Promise.resolve(null);

        const [emailSettled, waSettled] = await Promise.allSettled([emailPromise, waPromise]);

        const dispatch =
          emailSettled.status === "fulfilled" && emailSettled.value
            ? emailSettled.value
            : {
                partner: { ok: false, error: emailSettled.status === "rejected" ? String(emailSettled.reason) : "Kanal email dinonaktifkan" },
                escalation: { ok: false, error: emailSettled.status === "rejected" ? String(emailSettled.reason) : "Kanal email dinonaktifkan" },
              };

        const waResult =
          waSettled.status === "fulfilled"
            ? waSettled.value
            : { ok: false, to: recipient.whatsapp ?? "", error: "Gagal mengirim WhatsApp." };

        if (shouldSendEmail) {
          console.info(
            `[Email] urgent partner=${dispatch.partner.ok ? "ok" : "error"} escalation=${dispatch.escalation.ok ? "ok" : "error"}`,
          );
        }
        if (shouldSendWa) {
          console.info(`[WhatsApp] urgent ok=${waResult?.ok ? "true" : "false"}`);
        }

        const emailPartnerOk = shouldSendEmail && dispatch.partner.ok;
        const emailEscalationOk = shouldSendEmail && dispatch.escalation.ok;
        const waOk = shouldSendWa && Boolean(waResult?.ok);
        const anyPartnerOk = emailPartnerOk || waOk;
        const anyDelivered = anyPartnerOk || emailEscalationOk;

        if (!anyDelivered) {
          await releaseStageProcessingLock(todayWib, "urgent");
          await Promise.all([
            shouldSendEmail
              ? recordBotHealthError({
                  type: "smtp",
                  stage: "urgent",
                  message: dispatch.partner.error ?? "Gagal mengirim email urgent dan eskalasi.",
                })
              : Promise.resolve(),
            appendActivityLog({
              type: "cron_urgent",
              summary: `Gagal mengirim peringatan urgent (${scheduledTimeWib}) ke ${recipient.name} (${todayWib}).`,
              result: "error",
            }),
            pingSafe("delivery_error", "urgent"),
          ]);
          return withNoStore(
            jsonError(
              "Gagal mengirim peringatan urgent melalui seluruh kanal aktif.",
              "DELIVERY_FAILED",
              500,
              { dispatch, whatsapp: waResult },
            ),
          );
        }

        if (anyPartnerOk) {
          await setStageSentLock(todayWib, "urgent");
        }
        if (shouldSendEmail) {
          if (dispatch.partner.ok) {
            await clearBotHealthError("smtp");
          } else {
            await recordBotHealthError({
              type: "smtp",
              stage: "urgent",
              message: dispatch.partner.error ?? "Gagal mengirim email urgent ke penerima utama.",
            });
          }
        }
        await releaseStageProcessingLock(todayWib, "urgent");

        const allActiveOk =
          (!shouldSendEmail || (dispatch.partner.ok && dispatch.escalation.ok)) &&
          (!shouldSendWa || waOk);

        const channelParts: string[] = [];
        if (shouldSendEmail) {
          channelParts.push(`Email: ${dispatch.partner.ok ? "ok" : "gagal"}`);
        }
        if (shouldSendWa) {
          channelParts.push(`WA: ${waOk ? "ok" : "gagal"}`);
        }

        await Promise.all([
          appendActivityLog({
            type: "cron_urgent",
            summary: allActiveOk
              ? `Peringatan urgent (${scheduledTimeWib})${shouldSendEmail && icsConfig.enabledStages.urgent ? " + .ics" : ""} ke ${recipient.name} terkirim (${channelParts.join(", ")}, ${todayWib}).`
              : `Pengiriman urgent (${scheduledTimeWib}, ${todayWib}) selesai sebagian (${channelParts.join(", ")}).`,
            result: allActiveOk ? "success" : "partial",
          }),
          touchDashboardVersion(),
          pingSafe(allActiveOk ? "sent" : "partial", "urgent"),
        ]);

        return withNoStore(
          jsonOk(
            allActiveOk
              ? "Peringatan urgent berhasil dikirim."
              : "Pengiriman urgent selesai sebagian; cek detail hasil dan log aktivitas.",
            {
              status: allActiveOk ? "sent" : "partial",
              skipped: false,
              dateWib: todayWib,
              stage: targetStage,
              requestedStage,
              scheduledTimeWib,
              dispatch,
              channels: {
                email: shouldSendEmail ? dispatch : { skipped: true },
                whatsapp: shouldSendWa ? waResult : { skipped: true },
              },
            },
            allActiveOk ? 200 : 207,
          ),
        );
      }

      const includeIcs = icsConfig.enabledStages[targetStage];
      const [emailSettled, waSettled] = await Promise.allSettled([
        shouldSendEmail
          ? sendAttendanceReminder({
              stage: targetStage,
              dateWib: todayWib,
              recipient,
              senderName,
              confirmUrl,
              includeIcs,
              icsConfig,
              customMessage: customMessageText,
              scheduledTimeWib,
            })
          : Promise.resolve(null),
        shouldSendWa && recipient.whatsapp
          ? sendWhatsAppMessage(
              recipient.whatsapp,
              buildAttendanceReminderWhatsApp({
                stage: targetStage,
                dateWib: todayWib,
                recipientName: recipient.name,
                senderName,
                confirmUrl,
                customMessage: customMessageText,
                scheduledTimeWib,
              }),
            )
          : Promise.resolve(null),
      ]);

      const emailOk = shouldSendEmail && emailSettled.status === "fulfilled" && Boolean(emailSettled.value);
      const emailMessageId =
        emailSettled.status === "fulfilled" && emailSettled.value ? emailSettled.value.messageId : undefined;
      const emailError =
        emailSettled.status === "rejected"
          ? emailSettled.reason instanceof Error
            ? emailSettled.reason.message
            : "Gagal mengirim email melalui SMTP."
          : undefined;

      const waResult =
        waSettled.status === "fulfilled"
          ? waSettled.value
          : { ok: false, to: recipient.whatsapp ?? "", error: "Gagal mengirim WhatsApp." };
      const waOk = shouldSendWa && Boolean(waResult?.ok);

      if (shouldSendEmail) {
        console.info(`[Email] ${targetStage} ok=${emailOk}${emailError ? ` err=${emailError}` : ""}`);
      }
      if (shouldSendWa) {
        console.info(
          `[WhatsApp] ${targetStage} ok=${waOk}${waResult && !waResult.ok && waResult.error ? ` err=${waResult.error}` : ""}`,
        );
      }

      if (!emailOk && !waOk) {
        // Lepaskan lock dan jangan pasang sentLock agar tick berikutnya dapat mencoba ulang.
        await releaseStageProcessingLock(todayWib, targetStage);
        await Promise.all([
          shouldSendEmail
            ? recordBotHealthError({
                type: "smtp",
                stage: targetStage,
                message: emailError ?? "Gagal mengirim email melalui SMTP.",
              })
            : Promise.resolve(),
          appendActivityLog({
            type: targetStage === "morning" ? "cron_morning" : "cron_afternoon",
            summary: `Gagal mengirim pengingat ${STAGE_NAME[targetStage].toLowerCase()} (${scheduledTimeWib}) ke ${recipient.name} (${todayWib}).`,
            result: "error",
          }),
          pingSafe("delivery_error", targetStage),
        ]);
        return withNoStore(
          jsonError(
            `Gagal mengirim pengingat ${STAGE_NAME[targetStage].toLowerCase()} melalui seluruh kanal aktif.`,
            shouldSendEmail && !shouldSendWa ? "SMTP_SEND_FAILED" : "DELIVERY_FAILED",
            500,
            {
              channels: {
                email: shouldSendEmail ? { ok: false, error: emailError } : { skipped: true },
                whatsapp: shouldSendWa ? waResult : { skipped: true },
              },
            },
          ),
        );
      }

      const [lockTimestamp] = await Promise.all([
        setStageSentLock(todayWib, targetStage),
        shouldSendEmail
          ? emailOk
            ? clearBotHealthError("smtp")
            : recordBotHealthError({
                type: "smtp",
                stage: targetStage,
                message: emailError ?? "Gagal mengirim email melalui SMTP.",
              })
          : Promise.resolve(),
      ]);
      await releaseStageProcessingLock(todayWib, targetStage);

      const allActiveOk = (!shouldSendEmail || emailOk) && (!shouldSendWa || waOk);
      const channelSummaryParts: string[] = [];
      if (shouldSendEmail) {
        channelSummaryParts.push(`Email: ${emailOk ? "ok" : "gagal"}`);
      }
      if (shouldSendWa) {
        channelSummaryParts.push(`WA: ${waOk ? "ok" : "gagal"}`);
      }

      await Promise.all([
        appendActivityLog({
          type: targetStage === "morning" ? "cron_morning" : "cron_afternoon",
          summary:
            targetStage === "morning"
              ? `Pengingat pagi (${scheduledTimeWib})${shouldSendEmail && includeIcs ? " + .ics" : ""} ke ${recipient.name} (${channelSummaryParts.join(", ")}, ${todayWib}).`
              : `Pengecekan siang/sore (${scheduledTimeWib})${shouldSendEmail && includeIcs ? " + .ics" : ""} ke ${recipient.name} (${channelSummaryParts.join(", ")}, ${todayWib}).`,
          result: allActiveOk ? "success" : "partial",
        }),
        touchDashboardVersion(),
        pingSafe(allActiveOk ? "sent" : "partial", targetStage),
      ]);

      return withNoStore(
        jsonOk(
          allActiveOk
            ? `Pengingat ${STAGE_NAME[targetStage]} (${scheduledTimeWib}) berhasil dikirim ke ${recipient.name}.`
            : `Pengingat ${STAGE_NAME[targetStage]} (${scheduledTimeWib}) terkirim sebagian (${channelSummaryParts.join(", ")}).`,
          {
            status: allActiveOk ? "sent" : "partial",
            skipped: false,
            dateWib: todayWib,
            stage: targetStage,
            requestedStage,
            scheduledTimeWib,
            sentAt: lockTimestamp,
            ...(emailMessageId ? { messageId: emailMessageId } : {}),
            includeIcs,
            channels: {
              email: shouldSendEmail
                ? { ok: emailOk, ...(emailMessageId ? { messageId: emailMessageId } : {}), ...(emailError ? { error: emailError } : {}) }
                : { skipped: true },
              whatsapp: shouldSendWa ? waResult : { skipped: true },
            },
          },
          allActiveOk ? 200 : 207,
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
