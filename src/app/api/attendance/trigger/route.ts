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
import {
  appendActivityLog,
  clearBotHealthError,
  getActiveCustomMessage,
  getActiveIcsConfig,
  getActiveRecipient,
  getActiveSenderName,
  getAttendanceStatus,
  recordBotHealthError,
  touchDashboardVersion,
} from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { triggerAttendanceSchema } from "@/lib/validators";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { buildAttendanceReminderWhatsApp } from "@/lib/whatsapp-templates";

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

    const {
      customNote,
      note,
      senderName: overrideSenderName,
      useActiveMessage,
      includeIcs,
      channel: overrideChannel,
      forceSend,
    } = parsed.data;
    const todayWib = getTodayWibDate();

    const [existingStatus, recipient, activeCustomMessage, defaultSenderName, icsConfig] =
      await Promise.all([
        getAttendanceStatus(todayWib),
        getActiveRecipient(),
        getActiveCustomMessage(todayWib),
        getActiveSenderName(),
        getActiveIcsConfig(),
      ]);

    if (existingStatus && !forceSend) {
      return jsonError(
        "Status absen hari ini sudah tercatat terkonfirmasi. Konfirmasi kirim ulang jika tetap ingin mengirim pengingat.",
        "ALREADY_CONFIRMED",
        409,
        { confirmedAt: existingStatus.confirmedAt },
      );
    }

    const activeChannel = overrideChannel ?? recipient.channel ?? "email";
    const wantsWa = activeChannel === "whatsapp" || activeChannel === "both";
    const wantsEmail = activeChannel === "email" || activeChannel === "both";

    if (wantsWa && !recipient.whatsapp && !wantsEmail) {
      return jsonError(
        "Nomor WhatsApp penerima belum diatur. Isi nomor WhatsApp di Pengaturan Bot terlebih dahulu.",
        "WHATSAPP_RECIPIENT_MISSING",
        400,
      );
    }

    const shouldSendWa = wantsWa && Boolean(recipient.whatsapp);
    const shouldSendEmail = wantsEmail || !shouldSendWa;

    const resolvedIncludeIcs = includeIcs ?? icsConfig.manualIncludeIcs;
    const explicitNote = customNote ?? note;
    const resolvedMessage =
      explicitNote ?? (useActiveMessage ? activeCustomMessage?.message ?? null : null);

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = getAppBaseUrl(requestOrigin);
    const token = createAttendanceToken(todayWib);
    const confirmUrl = `${baseUrl}/confirm?date=${encodeURIComponent(todayWib)}&token=${encodeURIComponent(token)}`;

    const resolvedSenderName = overrideSenderName ?? defaultSenderName;

    const [emailSettled, waSettled] = await Promise.allSettled([
      shouldSendEmail
        ? sendAttendanceReminder({
            stage: "manual",
            dateWib: todayWib,
            recipient,
            senderName: resolvedSenderName,
            confirmUrl,
            includeIcs: resolvedIncludeIcs,
            icsConfig,
            customMessage: resolvedMessage,
          })
        : Promise.resolve(null),
      shouldSendWa && recipient.whatsapp
        ? sendWhatsAppMessage(
            recipient.whatsapp,
            buildAttendanceReminderWhatsApp({
              stage: "manual",
              dateWib: todayWib,
              recipientName: recipient.name,
              senderName: resolvedSenderName,
              confirmUrl,
              customMessage: resolvedMessage,
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
      console.info(`[Email] manual ok=${emailOk}${emailError ? ` err=${emailError}` : ""}`);
    }
    if (shouldSendWa) {
      console.info(
        `[WhatsApp] manual ok=${waOk}${waResult && !waResult.ok && waResult.error ? ` err=${waResult.error}` : ""}`,
      );
    }

    if (shouldSendEmail) {
      if (emailOk) {
        await clearBotHealthError("smtp");
      } else {
        await recordBotHealthError({
          type: "smtp",
          stage: "manual",
          message: emailError ?? "Gagal mengirim email melalui SMTP.",
        });
      }
    }

    if (!emailOk && !waOk) {
      await appendActivityLog({
        type: "manual_reminder",
        summary: `Gagal mengirim pengingat manual ke ${recipient.name} (${todayWib}).`,
        result: "error",
      });
      if (shouldSendEmail && !shouldSendWa && emailSettled.status === "rejected") {
        throw emailSettled.reason;
      }
      return jsonError(
        waResult?.error ?? emailError ?? "Gagal mengirim pengingat manual.",
        "DELIVERY_FAILED",
        502,
        {
          channels: {
            email: shouldSendEmail ? { ok: false, error: emailError } : { skipped: true },
            whatsapp: shouldSendWa ? waResult : { skipped: true },
          },
        },
      );
    }

    const allActiveOk = (!shouldSendEmail || emailOk) && (!shouldSendWa || waOk);
    const channelParts: string[] = [];
    if (shouldSendEmail) {
      channelParts.push(`Email: ${emailOk ? "ok" : "gagal"}`);
    }
    if (shouldSendWa) {
      channelParts.push(`WA: ${waOk ? "ok" : "gagal"}`);
    }

    await Promise.all([
      appendActivityLog({
        type: "manual_reminder",
        summary: `Pengingat manual ke ${recipient.name} (${channelParts.join(", ")}, ${todayWib}${shouldSendEmail ? (resolvedIncludeIcs ? ", dengan .ics" : ", tanpa .ics") : ""}${forceSend && existingStatus ? ", paksa kirim ulang" : ""}).`,
        result: allActiveOk ? "success" : "partial",
      }),
      touchDashboardVersion(),
    ]);

    return jsonOk(
      allActiveOk
        ? `Pengingat absen manual berhasil dikirim ke ${recipient.name} (${channelParts.join(", ")}).`
        : `Pengingat manual terkirim sebagian ke ${recipient.name} (${channelParts.join(", ")}).`,
      {
        dateWib: todayWib,
        includeIcs: resolvedIncludeIcs,
        ...(emailMessageId ? { messageId: emailMessageId } : {}),
        channels: {
          email: shouldSendEmail
            ? { ok: emailOk, ...(emailMessageId ? { messageId: emailMessageId } : {}), ...(emailError ? { error: emailError } : {}) }
            : { skipped: true },
          whatsapp: shouldSendWa ? waResult : { skipped: true },
        },
      },
      allActiveOk ? 200 : 207,
    );
  } catch (error) {
    return handleRouteError(error, "Gagal mengirim pengingat absen manual.");
  }
}
