import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { setActiveSenderName } from "@/lib/store";
import { senderConfigSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, senderConfigSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const sender = await setActiveSenderName(parsed.data.name);
    return jsonOk(`Nama pengirim default diperbarui ke "${sender.name}".`, sender);
  } catch (error) {
    return handleRouteError(error, "Gagal memperbarui nama pengirim default.");
  }
}
