import { requireAuthenticatedSession, withNoStore } from "@/lib/api-helpers";
import { executeCronAttendance } from "@/lib/cron-attendance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authFailure = await requireAuthenticatedSession();
  if (authFailure) {
    return withNoStore(authFailure);
  }

  return executeCronAttendance({
    request,
    requestedStage: "auto",
    source: "dashboard_check",
    trackCronPing: false,
  });
}
