import {
  handleRouteError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { setActiveRecipient } from "@/lib/store";
import { recipientConfigSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, recipientConfigSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const recipient = await setActiveRecipient(parsed.data);
    return jsonOk(
      `Penerima aktif diperbarui ke ${recipient.name} (${recipient.email}).`,
      recipient,
    );
  } catch (error) {
    return handleRouteError(error, "Gagal memperbarui data penerima aktif.");
  }
}
