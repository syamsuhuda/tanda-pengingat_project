import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import {
  appendActivityLog,
  deleteFriendContact,
  getFriendContactById,
  updateFriendContact,
} from "@/lib/store";
import { updateContactSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const { id } = await context.params;
    const cleanId = id?.trim();
    if (!cleanId) {
      return jsonError("ID kontak tidak valid.", "INVALID_ID", 400);
    }

    const parsed = await parseJsonBody(request, updateContactSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const updated = await updateFriendContact(cleanId, parsed.data);
    if (!updated) {
      return jsonError("Kontak tidak ditemukan.", "NOT_FOUND", 404);
    }

    await appendActivityLog({
      type: "contact_updated",
      summary: `Kontak diperbarui: ${updated.name} (${updated.group}).`,
      result: "success",
    });

    return jsonOk("Data kontak berhasil diperbarui.", updated);
  } catch (error) {
    return handleRouteError(error, "Gagal memperbarui data kontak.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const { id } = await context.params;
    const cleanId = id?.trim();
    if (!cleanId) {
      return jsonError("ID kontak tidak valid.", "INVALID_ID", 400);
    }

    const existing = await getFriendContactById(cleanId);
    if (!existing) {
      return jsonError("Kontak tidak ditemukan.", "NOT_FOUND", 404);
    }

    const deleted = await deleteFriendContact(cleanId);
    if (!deleted) {
      return jsonError("Kontak tidak ditemukan.", "NOT_FOUND", 404);
    }

    await appendActivityLog({
      type: "contact_updated",
      summary: `Kontak dihapus: ${existing.name} (${existing.email}).`,
      result: "success",
    });

    return jsonOk("Kontak berhasil dihapus.", { id: cleanId });
  } catch (error) {
    return handleRouteError(error, "Gagal menghapus kontak.");
  }
}
