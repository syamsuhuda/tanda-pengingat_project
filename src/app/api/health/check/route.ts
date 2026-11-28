import {
  handleRouteError,
  jsonOk,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { evaluateBotHealth } from "@/lib/bot-health";
import { verifySmtpConnection } from "@/lib/mailer";
import { getRedis } from "@/lib/redis";
import {
  clearBotHealthError,
  getDashboardSnapshotViaPipeline,
  recordBotHealthError,
  recordBotHealthVerified,
  touchDashboardVersion,
} from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const todayWib = getTodayWibDate();
    const redis = getRedis();

    let redisOk = false;
    let redisLatencyMs: number | null = null;
    try {
      const pingStart = Date.now();
      await redis.ping();
      redisLatencyMs = Date.now() - pingStart;
      redisOk = true;
    } catch {
      redisOk = false;
    }

    const [snapshot, smtpVerify] = await Promise.all([
      getDashboardSnapshotViaPipeline(todayWib),
      verifySmtpConnection(8000),
    ]);

    let effectiveLastError = snapshot.healthLastError;
    if (smtpVerify.ok) {
      if (effectiveLastError?.type === "smtp") {
        await clearBotHealthError("smtp");
        effectiveLastError = null;
      }
      await Promise.all([recordBotHealthVerified(), touchDashboardVersion()]);
    } else {
      effectiveLastError = await recordBotHealthError({
        type: "smtp",
        stage: "health_check",
        message: smtpVerify.error ?? "Verifikasi Gmail SMTP gagal.",
      });
    }

    const isTodayOff = snapshot.upcomingOffDays.some((entry) => entry.date === todayWib);
    const todayOffNote = snapshot.upcomingOffDays.find((entry) => entry.date === todayWib)?.note;

    const alarmText =
      snapshot.icsConfig.alarmBeforeMinutes === 0
        ? "alarm saat mulai"
        : `alarm -${snapshot.icsConfig.alarmBeforeMinutes}m`;

    const botHealth = evaluateBotHealth({
      redisOk,
      redisLatencyMs,
      recipientEmail: snapshot.recipient.email,
      paused: snapshot.pauseConfig.paused,
      pauseNote: snapshot.pauseConfig.note,
      isTodayOff,
      offDayNote: todayOffNote,
      schedule: snapshot.schedule,
      cronHealth: snapshot.cronHealth,
      lastError: effectiveLastError,
      icsSummaryText: `.ics +${snapshot.icsConfig.startOffsetMinutes}m (${alarmText})`,
    });

    return withNoStore(
      jsonOk(
        smtpVerify.ok
          ? "Pemeriksaan kesehatan sistem selesai: Redis dan Gmail SMTP siap."
          : "Pemeriksaan selesai: ditemukan kendala pada layanan Gmail SMTP.",
        {
          botHealth,
          cronHealth: snapshot.cronHealth,
          icsConfig: snapshot.icsConfig,
          smtpVerify: {
            ok: smtpVerify.ok,
            latencyMs: smtpVerify.latencyMs,
          },
        },
      ),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal menjalankan pemeriksaan kesehatan bot."));
  }
}
