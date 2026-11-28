import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import {
  DEFAULT_CATEGORY_BY_MODE,
  normalizeItineraryMode,
} from "@/lib/itinerary-copy";
import { sendItineraryInvitation } from "@/lib/mailer";
import {
  appendActivityLog,
  getActiveRecipient,
  getActiveSenderName,
  listFriendContacts,
  touchDashboardVersion,
} from "@/lib/store";
import type { RecipientAddress } from "@/lib/types";
import { sendItinerarySchema } from "@/lib/validators";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { buildItineraryWhatsApp } from "@/lib/whatsapp-templates";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 30;

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, sendItinerarySchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const {
      mode: rawMode,
      contactIds,
      manualEmails,
      manualWhatsApps,
      channel: requestedChannel,
      senderName: customSenderName,
      categoryLabel: customCategoryLabel,
      messageTone,
      customIntroMessage,
      subject,
      alarmMinutes,
      icsMode,
      sessions,
    } = parsed.data;

    const mode = normalizeItineraryMode(rawMode);
    let resolvedSenderName: string;
    if (mode === "date") {
      resolvedSenderName = customSenderName ?? (await getActiveSenderName());
    } else {
      const explicitSender = customSenderName?.trim() ?? "";
      if (!explicitSender) {
        return jsonError(
          "Nama pengirim wajib diisi untuk mode Acara & Kegiatan.",
          "SENDER_NAME_REQUIRED",
          400,
        );
      }
      resolvedSenderName = explicitSender;
    }
    const resolvedCategoryLabel = customCategoryLabel ?? DEFAULT_CATEGORY_BY_MODE[mode];

    let recipients: RecipientAddress[] = [];
    const whatsappTargets: Array<{ name?: string; phone: string }> = [];
    let dateRecipientName: string | undefined;

    if (mode === "date") {
      // Pada mode Date Itinerary, server selalu mengambil penerima aktif terbaru dari Redis/env.
      const activeRecipient = await getActiveRecipient();
      recipients = [{ name: activeRecipient.name, email: activeRecipient.email }];
      dateRecipientName = activeRecipient.name;
      if (activeRecipient.whatsapp) {
        whatsappTargets.push({ name: activeRecipient.name, phone: activeRecipient.whatsapp });
      }
    } else {
      const allContacts = await listFriendContacts();
      const contactById = new Map(allContacts.map((c) => [c.id, c]));
      const deduped = new Map<string, RecipientAddress>();
      const dedupedWa = new Map<string, { name?: string; phone: string }>();

      for (const id of contactIds) {
        const contact = contactById.get(id);
        if (contact) {
          deduped.set(contact.email.toLowerCase(), {
            name: contact.name,
            email: contact.email,
          });
          if (contact.whatsapp) {
            dedupedWa.set(contact.whatsapp, { name: contact.name, phone: contact.whatsapp });
          }
        }
      }

      for (const email of manualEmails) {
        const normalized = email.trim().toLowerCase();
        if (!deduped.has(normalized)) {
          deduped.set(normalized, { email: normalized });
        }
      }

      for (const phone of manualWhatsApps) {
        if (!dedupedWa.has(phone)) {
          dedupedWa.set(phone, { phone });
        }
      }

      recipients = Array.from(deduped.values());
      whatsappTargets.push(...dedupedWa.values());

      const needsEmail = requestedChannel === "email" || requestedChannel === "both";
      const needsWa = requestedChannel === "whatsapp" || requestedChannel === "both";

      if (needsEmail && recipients.length === 0 && !needsWa) {
        return jsonError(
          "Pilih minimal satu kontak tersimpan atau masukkan alamat email penerima.",
          "NO_RECIPIENTS",
          400,
        );
      }

      if (needsWa && whatsappTargets.length === 0 && !needsEmail) {
        return jsonError(
          "Pilih minimal satu kontak yang memiliki nomor WhatsApp atau masukkan nomor WhatsApp manual.",
          "NO_WHATSAPP_RECIPIENTS",
          400,
        );
      }

      if (recipients.length === 0 && whatsappTargets.length === 0) {
        return jsonError(
          "Pilih minimal satu kontak tersimpan atau masukkan penerima Email/WhatsApp.",
          "NO_RECIPIENTS",
          400,
        );
      }

      if (recipients.length > MAX_RECIPIENTS || whatsappTargets.length > MAX_RECIPIENTS) {
        return jsonError(
          `Maksimal ${MAX_RECIPIENTS} penerima unik dalam satu pengiriman.`,
          "MAX_RECIPIENTS_EXCEEDED",
          400,
        );
      }
    }

    const sendEmail =
      (requestedChannel === "email" || requestedChannel === "both") && recipients.length > 0;
    const sendWa =
      (requestedChannel === "whatsapp" || requestedChannel === "both") && whatsappTargets.length > 0;

    if (requestedChannel === "whatsapp" && whatsappTargets.length === 0) {
      return jsonError(
        mode === "date"
          ? "Nomor WhatsApp pasangan belum diisi di Pengaturan Bot."
          : "Tidak ada nomor WhatsApp tujuan yang valid.",
        "NO_WHATSAPP_RECIPIENTS",
        400,
      );
    }

    const emailPromise = sendEmail
      ? sendItineraryInvitation({
          mode,
          recipients,
          senderName: resolvedSenderName,
          recipientName: dateRecipientName,
          categoryLabel: resolvedCategoryLabel,
          messageTone,
          customIntroMessage,
          subject,
          sessions,
          alarmMinutes,
          icsMode,
        })
      : Promise.resolve(null);

    const waPromise = sendWa
      ? Promise.allSettled(
          whatsappTargets.map((target) =>
            sendWhatsAppMessage(
              target.phone,
              buildItineraryWhatsApp({
                mode,
                subject,
                senderName: resolvedSenderName,
                recipientName: target.name ?? dateRecipientName,
                categoryLabel: resolvedCategoryLabel,
                customIntroMessage,
                sessions,
              }),
            ),
          ),
        )
      : Promise.resolve(null);

    const [emailSettled, waSettled] = await Promise.allSettled([emailPromise, waPromise]);

    const emailResult =
      emailSettled.status === "fulfilled" ? emailSettled.value : null;
    const emailError =
      emailSettled.status === "rejected"
        ? emailSettled.reason instanceof Error
          ? emailSettled.reason.message
          : "Gagal mengirim email itinerary."
        : undefined;

    const waResults =
      waSettled.status === "fulfilled" && Array.isArray(waSettled.value)
        ? waSettled.value.map((item) =>
            item.status === "fulfilled"
              ? item.value
              : { ok: false, to: "", error: "Gagal mengirim WhatsApp." },
          )
        : [];
    const waSentCount = waResults.filter((r) => r.ok).length;
    const waFailedCount = waResults.length - waSentCount;

    if (sendEmail) {
      console.info(
        `[Email] itinerary ok=${Boolean(emailResult)}${emailError ? ` err=${emailError}` : ""}`,
      );
    }
    if (sendWa) {
      console.info(`[WhatsApp] itinerary sent=${waSentCount}/${waResults.length}`);
    }

    const emailOk = sendEmail && Boolean(emailResult);
    const waOk = sendWa && waSentCount > 0;

    if (!emailOk && !waOk) {
      if (sendEmail && !sendWa && emailSettled.status === "rejected") {
        throw emailSettled.reason;
      }
      return jsonError(
        emailError ?? waResults[0]?.error ?? "Gagal mengirim undangan itinerary.",
        "DELIVERY_FAILED",
        502,
      );
    }

    const allActiveOk = (!sendEmail || emailOk) && (!sendWa || waFailedCount === 0);
    const channelSummary: string[] = [];
    if (sendEmail) {
      channelSummary.push(
        emailOk ? `Email: ${emailResult!.accepted.join(", ")}` : `Email: gagal (${emailError})`,
      );
    }
    if (sendWa) {
      channelSummary.push(`WA: ${waSentCount}/${waResults.length} terkirim`);
    }

    const modeSummary = mode === "date" ? "Date Itinerary" : "Acara & Kegiatan";
    await appendActivityLog({
      type: "itinerary_sent",
      summary: `${modeSummary} [${resolvedCategoryLabel}] "${subject}" (${sessions.length} sesi) oleh ${resolvedSenderName} (${channelSummary.join(" | ")}).`,
      result: allActiveOk ? "success" : "partial",
    });
    await touchDashboardVersion();

    return jsonOk(
      allActiveOk
        ? `Undangan "${subject}" berhasil dikirim (${channelSummary.join(" | ")}).`
        : `Undangan "${subject}" terkirim sebagian (${channelSummary.join(" | ")}).`,
      {
        ...(emailResult ?? {}),
        channels: {
          email: sendEmail
            ? emailOk
              ? { ok: true, accepted: emailResult!.accepted }
              : { ok: false, error: emailError }
            : { skipped: true },
          whatsapp: sendWa
            ? { ok: waFailedCount === 0, sent: waSentCount, total: waResults.length, results: waResults }
            : { skipped: true },
        },
      },
      allActiveOk ? 200 : 207,
    );
  } catch (error) {
    if (error instanceof Error && error.name === "SmtpNoAcceptedRecipientsError") {
      return jsonError(error.message, "SMTP_DELIVERY_REJECTED", 502);
    }
    return handleRouteError(error, "Gagal mengirim undangan itinerary.");
  }
}
