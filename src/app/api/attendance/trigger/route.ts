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

    const { customNote, note, senderName: overrideSenderName, useActiveMessage, includeIcs, forceSend } =
      parsed.data;
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

    const resolvedIncludeIcs = includeIcs ?? icsConfig.manualIncludeIcs;
    const explicitNote = customNote ?? note;
    const resolvedMessage =
      explicitNote ?? (useActiveMessage ? activeCustomMessage?.message ?? null : null);

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = getAppBaseUrl(requestOrigin);
    const token = createAttendanceToken(todayWib);
    const confirmUrl = `${baseUrl}/confirm?date=${encodeURIComponent(todayWib)}&token=${encodeURIComponent(token)}`;

    const resolvedSenderName = overrideSenderName ?? defaultSenderName;
    let sent: { messageId: string };
    try {
      sent = await sendAttendanceReminder({
        stage: "manual",
        dateWib: todayWib,
        recipient,
        senderName: resolvedSenderName,
        confirmUrl,
        includeIcs: resolvedIncludeIcs,
        icsConfig,
        customMessage: resolvedMessage,
      });
    } catch (smtpError) {
      await recordBotHealthError({
        type: "smtp",
        stage: "manual",
        message: smtpError,
      });
      throw smtpError;
    }

    await Promise.all([
      clearBotHealthError("smtp"),
      appendActivityLog({
        type: "manual_reminder",
        summary: `Pengingat manual dikirim ke ${recipient.name} (${todayWib}${resolvedIncludeIcs ? ", dengan .ics" : ", tanpa .ics"}${forceSend && existingStatus ? ", paksa kirim ulang" : ""}).`,
        result: "success",
      }),
      touchDashboardVersion(),
    ]);

    return jsonOk(`Pengingat absen manual berhasil dikirim ke ${recipient.name}.`, {
      dateWib: todayWib,
      includeIcs: resolvedIncludeIcs,
      messageId: sent.messageId,
    });
  } catch (error) {
    return handleRouteError(error, "Gagal mengirim pengingat absen manual.");
  }
}
