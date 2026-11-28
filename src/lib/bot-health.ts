import { getNowWibIso } from "./timezone";
import type {
  AttendanceScheduleConfig,
  BotHealthCheckItem,
  BotHealthErrorRecord,
  BotHealthSummary,
  CronHealthSummary,
} from "./types";

export const SCHEDULER_HEALTHY_MAX_AGE_MINUTES = 12;
export const SCHEDULER_DELAYED_MAX_AGE_MINUTES = 20;

const EMAIL_SIMPLE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED_ENV_KEYS = [
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "MY_EMAIL",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

export function sanitizeHealthErrorMessage(raw: unknown): string {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : "Terjadi kendala saat mengirim email.";
  const cleaned = text
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/([a-zA-Z0-9._%+-]+@[^\s]+)/g, "[email]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "Koneksi ke server email gagal.";
  }
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
}

export function validateBotEnvAndRecipient(recipientEmail: string): BotHealthCheckItem {
  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => {
    const val = process.env[key];
    return typeof val !== "string" || val.trim().length === 0;
  });

  if (missingKeys.length > 0) {
    return {
      ok: false,
      status: "error",
      label: "Konfigurasi Server",
      detail: `Variabel environment belum lengkap (${missingKeys.join(", ")}).`,
    };
  }

  if (!EMAIL_SIMPLE_REGEX.test(recipientEmail.trim())) {
    return {
      ok: false,
      status: "error",
      label: "Konfigurasi Server",
      detail: "Alamat email penerima aktif belum valid.",
    };
  }

  return {
    ok: true,
    status: "ok",
    label: "Konfigurasi Server",
    detail: "Semua variabel wajib dan email penerima valid.",
  };
}

export interface EvaluateBotHealthInput {
  redisOk: boolean;
  redisLatencyMs?: number | null;
  recipientEmail: string;
  paused: boolean;
  pauseNote?: string;
  isTodayOff: boolean;
  offDayNote?: string;
  schedule: AttendanceScheduleConfig;
  cronHealth: CronHealthSummary;
  lastError: BotHealthErrorRecord | null;
  icsSummaryText?: string;
  now?: Date;
}

export function evaluateBotHealth(input: EvaluateBotHealthInput): BotHealthSummary {
  const checkedAt = getNowWibIso(input.now ?? new Date());
  const envCheck = validateBotEnvAndRecipient(input.recipientEmail);

  const redisCheck: BotHealthCheckItem & { latencyMs?: number | null } = input.redisOk
    ? {
        ok: true,
        status: "ok",
        label: "Server & Redis",
        detail:
          typeof input.redisLatencyMs === "number"
            ? `Terhubung (${input.redisLatencyMs} ms)`
            : "Terhubung normal",
        latencyMs: input.redisLatencyMs ?? null,
      }
    : {
        ok: false,
        status: "error",
        label: "Server & Redis",
        detail: "Koneksi ke Upstash Redis gagal.",
        latencyMs: null,
      };

  const enabledCount = (["morning", "afternoon", "urgent"] as const).filter(
    (s) => input.schedule[s].enabled,
  ).length;
  const scheduleCheck: BotHealthCheckItem =
    enabledCount > 0
      ? {
          ok: true,
          status: "ok",
          label: "Jadwal & Kalender .ics",
          detail: input.icsSummaryText
            ? `${enabledCount} tahap aktif · ${input.icsSummaryText}`
            : `${enabledCount} tahap pengingat aktif`,
        }
      : {
          ok: false,
          status: "warning",
          label: "Jadwal & Kalender .ics",
          detail: "Semua tahap pengingat (Pagi, Siang/Sore, Urgent) sedang dimatikan.",
        };

  const pingAge = input.cronHealth.minutesSinceLastPing;
  const sourceLabel = input.cronHealth.source ? ` (${input.cronHealth.source})` : "";
  let schedulerCheck: BotHealthCheckItem;

  if (input.cronHealth.status === "never" || pingAge === null) {
    schedulerCheck = {
      ok: false,
      status: "error",
      label: "Scheduler Otomatis",
      detail: "Belum pernah memanggil server sama sekali.",
    };
  } else if (pingAge > SCHEDULER_DELAYED_MAX_AGE_MINUTES) {
    schedulerCheck = {
      ok: false,
      status: "error",
      label: "Scheduler Otomatis",
      detail: `Terakhir aktif ${pingAge} menit lalu${sourceLabel} (batas > ${SCHEDULER_DELAYED_MAX_AGE_MINUTES} mnt).`,
    };
  } else if (pingAge > SCHEDULER_HEALTHY_MAX_AGE_MINUTES) {
    schedulerCheck = {
      ok: false,
      status: "warning",
      label: "Scheduler Otomatis",
      detail: `Sedikit lambat · terakhir ${pingAge} menit lalu${sourceLabel}.`,
    };
  } else {
    schedulerCheck = {
      ok: true,
      status: "ok",
      label: "Scheduler Otomatis",
      detail:
        pingAge === 0
          ? `Aktif${sourceLabel} · baru saja`
          : `Aktif${sourceLabel} · ${pingAge} mnt lalu`,
    };
  }

  const deliveryCheck: BotHealthCheckItem = input.lastError
    ? {
        ok: false,
        status: "error",
        label: "Layanan Email / SMTP",
        detail: `${input.lastError.stage ? `Tahap ${input.lastError.stage}: ` : ""}${input.lastError.message}`,
      }
    : {
        ok: true,
        status: "ok",
        label: "Layanan Email / SMTP",
        detail: "Siap mengirim email tanpa kendala.",
      };

  const checks = {
    redis: redisCheck,
    env: envCheck,
    scheduler: schedulerCheck,
    delivery: deliveryCheck,
    schedule: scheduleCheck,
  };

  // Urutan prioritas ketat anti false-positive:
  if (!input.redisOk) {
    return {
      state: "offline",
      label: "Koneksi Terputus",
      severity: "error",
      summary: "Koneksi database Redis terganggu.",
      detail: redisCheck.detail,
      checkedAt,
      checks,
    };
  }

  if (!envCheck.ok) {
    return {
      state: "config_error",
      label: "Konfigurasi Error",
      severity: "error",
      summary: "Konfigurasi server atau email penerima bermasalah.",
      detail: envCheck.detail,
      checkedAt,
      checks,
    };
  }

  if (input.paused) {
    const schedulerNote = !schedulerCheck.ok
      ? ` Catatan: ${schedulerCheck.detail}`
      : "";
    return {
      state: "paused",
      label: "Bot Dijeda",
      severity: "warning",
      summary: input.pauseNote
        ? `Pengiriman otomatis dijeda (${input.pauseNote}).`
        : "Pengiriman otomatis sedang dijeda manual.",
      detail: `Aktifkan kembali kapan saja bila ingin bot mengirim otomatis.${schedulerNote}`,
      checkedAt,
      checks,
    };
  }

  if (enabledCount === 0) {
    return {
      state: "no_schedule",
      label: "Jadwal Nonaktif",
      severity: "warning",
      summary: "Tidak ada jam kirim yang aktif.",
      detail: "Nyalakan minimal satu tahap di Pengaturan Bot -> Jam Kirim.",
      checkedAt,
      checks,
    };
  }

  if (input.lastError) {
    return {
      state: "delivery_error",
      label: "Gagal Kirim",
      severity: "error",
      summary: "Pengiriman email terakhir mengalami kegagalan SMTP.",
      detail: deliveryCheck.detail,
      checkedAt,
      checks,
    };
  }

  if (input.cronHealth.status === "never" || pingAge === null) {
    return {
      state: "scheduler_down",
      label: "Scheduler Mati",
      severity: "error",
      summary: "Scheduler eksternal belum pernah memanggil server.",
      detail: "Hubungkan cron-job.org (interval 5 menit) atau GitHub Actions agar email otomatis terkirim.",
      checkedAt,
      checks,
    };
  }

  if (pingAge > SCHEDULER_DELAYED_MAX_AGE_MINUTES) {
    return {
      state: "scheduler_down",
      label: "Scheduler Mati",
      severity: "error",
      summary: `Scheduler berhenti atau terlambat (${pingAge} menit lalu).`,
      detail: "Periksa status cron-job.org / GitHub Actions lalu uji koneksi ulang.",
      checkedAt,
      checks,
    };
  }

  if (pingAge > SCHEDULER_HEALTHY_MAX_AGE_MINUTES) {
    return {
      state: "scheduler_delayed",
      label: "Scheduler Lambat",
      severity: "warning",
      summary: `Ping scheduler terakhir ${pingAge} menit lalu.`,
      detail: "Melewati batas segar 12 menit. Pastikan interval cron-job.org diset ke 5 menit.",
      checkedAt,
      checks,
    };
  }

  if (input.isTodayOff) {
    return {
      state: "holiday",
      label: "Libur · Sistem Sehat",
      severity: "ok",
      summary: input.offDayNote
        ? `Hari ini libur (${input.offDayNote}). Seluruh sistem sehat.`
        : "Hari ini libur. Seluruh sistem berjalan sehat.",
      detail: "Pengingat otomatis dilewati hari ini dan lanjut normal di hari berikutnya.",
      checkedAt,
      checks,
    };
  }

  return {
    state: "active",
    label: "Bot Aktif",
    severity: "ok",
    summary: "Seluruh sistem sehat dan siap mengirim tepat waktu.",
    detail: `${schedulerCheck.detail} · ${scheduleCheck.detail}`,
    checkedAt,
    checks,
  };
}
