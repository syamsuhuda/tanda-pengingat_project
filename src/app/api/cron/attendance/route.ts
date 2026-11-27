import { jsonError, withNoStore } from "@/lib/api-helpers";
import { executeCronAttendance } from "@/lib/cron-attendance";
import { verifyCronBearerToken } from "@/lib/security";
import type { AttendanceStage } from "@/lib/types";
import { cronAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function sanitizeCronSource(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
  return cleaned || undefined;
}

async function resolveCronPayload(
  request: Request,
): Promise<
  | { ok: true; stage: "auto" | AttendanceStage; bodySource?: string }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  const url = new URL(request.url);
  const queryStage = url.searchParams.get("stage")?.trim();
  const querySource = url.searchParams.get("source")?.trim();
  const rawBody = request.method === "GET" ? "" : await request.text();

  if (!rawBody.trim()) {
    const parsed = cronAttendanceSchema.safeParse({
      ...(queryStage ? { stage: queryStage } : {}),
      ...(querySource ? { source: querySource } : {}),
    });
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
    return {
      ok: true,
      stage: parsed.data.stage,
      bodySource: sanitizeCronSource(parsed.data.source),
    };
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

  return {
    ok: true,
    stage: parsed.data.stage,
    bodySource: sanitizeCronSource(parsed.data.source ?? querySource),
  };
}

function resolveCronSource(request: Request, bodySource?: string): string {
  if (bodySource) {
    return bodySource;
  }

  const headerSource = sanitizeCronSource(request.headers.get("x-cron-source"));
  if (headerSource) {
    return headerSource;
  }

  const userAgent = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (userAgent.includes("cron-job")) {
    return "cron-job.org";
  }
  if (userAgent.includes("github-actions") || userAgent.includes("curl")) {
    return "github-actions";
  }

  return "external-cron";
}

async function handleCronRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!verifyCronBearerToken(authHeader)) {
    return withNoStore(
      jsonError("Header Authorization Bearer CRON_SECRET tidak valid.", "UNAUTHORIZED", 401),
    );
  }

  const payloadResult = await resolveCronPayload(request);
  if (!payloadResult.ok) {
    return withNoStore(payloadResult.response);
  }

  const source = resolveCronSource(request, payloadResult.bodySource);

  return executeCronAttendance({
    request,
    requestedStage: payloadResult.stage,
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
