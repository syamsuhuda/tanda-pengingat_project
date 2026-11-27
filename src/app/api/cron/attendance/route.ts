import { jsonError, withNoStore } from "@/lib/api-helpers";
import { executeCronAttendance } from "@/lib/cron-attendance";
import { verifyCronBearerToken } from "@/lib/security";
import type { AttendanceStage } from "@/lib/types";
import { cronAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

async function resolveRequestedStage(
  request: Request,
): Promise<
  | { ok: true; stage: "auto" | AttendanceStage }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  const queryStage = new URL(request.url).searchParams.get("stage")?.trim();
  const rawBody = request.method === "GET" ? "" : await request.text();

  if (!rawBody.trim()) {
    const parsed = cronAttendanceSchema.safeParse(queryStage ? { stage: queryStage } : {});
    if (!parsed.success) {
      return {
        ok: false,
        response: jsonError(
          "Parameter stage harus berupa auto, morning, afternoon, atau urgent.",
          "VALIDATION_ERROR",
          400,
        ),
      };
    }
    return { ok: true, stage: parsed.data.stage };
  }

  let bodyObj: unknown;
  try {
    bodyObj = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: jsonError("Payload JSON tidak valid.", "INVALID_JSON", 400),
    };
  }

  const parsed = cronAttendanceSchema.safeParse(bodyObj);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        parsed.error.issues[0]?.message ?? "Parameter stage tidak valid.",
        "VALIDATION_ERROR",
        400,
      ),
    };
  }

  return { ok: true, stage: parsed.data.stage };
}

async function handleCronRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!verifyCronBearerToken(authHeader)) {
    return withNoStore(
      jsonError("Header Authorization Bearer CRON_SECRET tidak valid.", "UNAUTHORIZED", 401),
    );
  }

  const stageResult = await resolveRequestedStage(request);
  if (!stageResult.ok) {
    return withNoStore(stageResult.response);
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const source = userAgent.toLowerCase().includes("cron-job")
    ? "cron-job.org"
    : userAgent.toLowerCase().includes("curl")
      ? "github_actions"
      : request.method.toLowerCase();

  return executeCronAttendance({
    request,
    requestedStage: stageResult.stage,
    source,
    trackCronPing: true,
  });
}

export async function POST(request: Request) {
  return handleCronRequest(request);
}

export async function GET(request: Request) {
  return handleCronRequest(request);
}
