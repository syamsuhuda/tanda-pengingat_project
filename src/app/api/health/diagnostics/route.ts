import {
  handleRouteError,
  jsonOk,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { evaluateBotHealth } from "@/lib/bot-health";
import { verifySmtpConnection } from "@/lib/mailer";
import { getRedis } from "@/lib/redis";
import { getDashboardSnapshotViaPipeline } from "@/lib/store";
import { getTodayWibDate } from "@/lib/timezone";
import { getWhatsAppGatewayHealth, type WhatsAppGatewayHealth } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return withNoStore(authFailure);
    }

    const todayWib = getTodayWibDate();
    const redis = getRedis();

    const redisPingPromise = (async (): Promise<{ ok: boolean; latencyMs: number | null }> => {
      try {
        const start = Date.now();
        await redis.ping();
        return { ok: true, latencyMs: Date.now() - start };
      } catch {
        return { ok: false, latencyMs: null };
      }
    })();

    const [redisSettled, snapshotSettled, smtpSettled, waSettled] = await Promise.allSettled([
      redisPingPromise,
      getDashboardSnapshotViaPipeline(todayWib),
      verifySmtpConnection(6500),
      getWhatsAppGatewayHealth(),
    ]);

    const redisStatus =
      redisSettled.status === "fulfilled" ? redisSettled.value : { ok: false, latencyMs: null };
    const snapshot = snapshotSettled.status === "fulfilled" ? snapshotSettled.value : null;
    const smtpStatus =
      smtpSettled.status === "fulfilled"
        ? smtpSettled.value
        : { ok: false, latencyMs: 0, error: "Pemeriksaan Gmail SMTP gagal." };
    const whatsappStatus: WhatsAppGatewayHealth =
      waSettled.status === "fulfilled"
        ? waSettled.value
        : {
            configured: true,
            ok: false,
            status: "error",
            label: "Gagal Memeriksa",
            detail: "Tidak dapat menghubungi WhatsApp Gateway.",
            uptimeSec: null,
            connectedAt: null,
            memoryMb: null,
            lastError: "Diagnostics timeout",
          };

    if (!snapshot) {
      return withNoStore(
        jsonOk("Diagnosa parsial: koneksi penyimpanan bermasalah.", {
          whatsapp: whatsappStatus,
          smtp: {
            ok: smtpStatus.ok,
            latencyMs: smtpStatus.latencyMs,
            detail: smtpStatus.ok
              ? `Gmail SMTP siap (${smtpStatus.latencyMs} ms)`
              : smtpStatus.error ?? "Gmail SMTP gagal dihubungi.",
          },
          redis: {
            ok: redisStatus.ok,
            latencyMs: redisStatus.latencyMs,
            detail: redisStatus.ok
              ? `Upstash Redis terhubung (${redisStatus.latencyMs} ms)`
              : "Koneksi ke Upstash Redis gagal.",
          },
        }),
      );
    }

    const isTodayOff = snapshot.upcomingOffDays.some((entry) => entry.date === todayWib);
    const todayOffNote = snapshot.upcomingOffDays.find((entry) => entry.date === todayWib)?.note;
    const alarmText =
      snapshot.icsConfig.alarmBeforeMinutes === 0
        ? "alarm saat mulai"
        : `alarm -${snapshot.icsConfig.alarmBeforeMinutes}m`;

    const botHealth = evaluateBotHealth({
      redisOk: redisStatus.ok,
      redisLatencyMs: redisStatus.latencyMs,
      recipientEmail: snapshot.recipient.email,
      paused: snapshot.pauseConfig.paused,
      pauseNote: snapshot.pauseConfig.note,
      isTodayOff,
      offDayNote: todayOffNote,
      schedule: snapshot.schedule,
      cronHealth: snapshot.cronHealth,
      lastError: snapshot.healthLastError,
      icsSummaryText: `.ics +${snapshot.icsConfig.startOffsetMinutes}m (${alarmText})`,
    });

    return withNoStore(
      jsonOk("Diagnosa kesehatan sistem selesai.", {
        botHealth,
        cronHealth: snapshot.cronHealth,
        whatsapp: whatsappStatus,
        smtp: {
          ok: smtpStatus.ok,
          latencyMs: smtpStatus.latencyMs,
          detail: smtpStatus.ok
            ? `Gmail SMTP siap (${smtpStatus.latencyMs} ms)`
            : smtpStatus.error ?? "Gmail SMTP gagal dihubungi.",
        },
        redis: {
          ok: redisStatus.ok,
          latencyMs: redisStatus.latencyMs,
          detail: redisStatus.ok
            ? `Upstash Redis terhubung (${redisStatus.latencyMs} ms)`
            : "Koneksi ke Upstash Redis gagal.",
        },
      }),
    );
  } catch (error) {
    return withNoStore(handleRouteError(error, "Gagal menjalankan diagnosa kesehatan sistem."));
  }
}
