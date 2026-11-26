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
} from "@/lib/store";
import type { RecipientAddress } from "@/lib/types";
import { sendItinerarySchema } from "@/lib/validators";

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
    const resolvedSenderName = customSenderName ?? (await getActiveSenderName());
    const resolvedCategoryLabel = customCategoryLabel ?? DEFAULT_CATEGORY_BY_MODE[mode];

    let recipients: RecipientAddress[] = [];
    let dateRecipientName: string | undefined;

    if (mode === "date") {
      // Pada mode Date Itinerary, server selalu mengambil penerima aktif terbaru dari Redis/env.
      const activeRecipient = await getActiveRecipient();
      recipients = [{ name: activeRecipient.name, email: activeRecipient.email }];
      dateRecipientName = activeRecipient.name;
    } else {
      const allContacts = await listFriendContacts();
      const contactById = new Map(allContacts.map((c) => [c.id, c]));
      const deduped = new Map<string, RecipientAddress>();

      for (const id of contactIds) {
        const contact = contactById.get(id);
        if (contact) {
          deduped.set(contact.email.toLowerCase(), {
            name: contact.name,
            email: contact.email,
          });
        }
      }

      for (const email of manualEmails) {
        const normalized = email.trim().toLowerCase();
        if (!deduped.has(normalized)) {
          deduped.set(normalized, { email: normalized });
        }
      }

      recipients = Array.from(deduped.values());

      if (recipients.length === 0) {
        return jsonError(
          "Pilih minimal satu kontak tersimpan atau masukkan alamat email penerima.",
          "NO_RECIPIENTS",
          400,
        );
      }

      if (recipients.length > MAX_RECIPIENTS) {
        return jsonError(
          `Maksimal ${MAX_RECIPIENTS} penerima unik dalam satu pengiriman (saat ini: ${recipients.length}).`,
          "MAX_RECIPIENTS_EXCEEDED",
          400,
        );
      }
    }

    const result = await sendItineraryInvitation({
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
    });

    const modeSummary = mode === "date" ? "Date Itinerary" : "Acara & Kegiatan";
    await appendActivityLog({
      type: "itinerary_sent",
      summary: `${modeSummary} [${resolvedCategoryLabel}] "${subject}" (${result.sessionCount} sesi) oleh ${resolvedSenderName} terkirim ke ${result.recipientCount} penerima.`,
      result: "success",
    });

    return jsonOk(
      `Undangan "${subject}" berhasil dikirim ke ${result.recipientCount} penerima.`,
      result,
    );
  } catch (error) {
    return handleRouteError(error, "Gagal mengirim undangan itinerary.");
  }
}
