import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import {
  appendActivityLog,
  createFriendContact,
  listFriendContacts,
} from "@/lib/store";
import { createContactSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const contacts = await listFriendContacts();
    const groups = Array.from(new Set(contacts.map((c) => c.group))).sort((a, b) =>
      a.localeCompare(b, "id"),
    );

    return jsonOk("Daftar kontak berhasil dimuat.", { contacts, groups });
  } catch (error) {
    return handleRouteError(error, "Gagal memuat daftar kontak.");
  }
}

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, createContactSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const contact = await createFriendContact(parsed.data);

    await appendActivityLog({
      type: "contact_updated",
      summary: `Kontak ditambahkan: ${contact.name} (${contact.group}).`,
      result: "success",
    });

    return jsonOk("Kontak baru berhasil disimpan.", contact, 201);
  } catch (error) {
    return handleRouteError(error, "Gagal menambahkan kontak baru.");
  }
}
