import {
  handleRouteError,
  jsonOk,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { getWhatsAppGatewayHealth } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const health = await getWhatsAppGatewayHealth();
    return withNoStore(jsonOk(health.detail, health));
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal memeriksa status WhatsApp Gateway."));
  }
}
