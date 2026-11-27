import crypto from "node:crypto";
import { getEnv } from "./env";
import { getRedis } from "./redis";
import {
  generateVerificationToken,
  hashPinScrypt,
  hashPurposeToken,
  sanitizeSenderDisplayName,
  SESSION_VERSION_REDIS_KEY,
  verifyPin,
  verifyPinScrypt,
  verifyPurposeToken,
} from "./security";
import { getNowWibIso, getNowWibTimeLabel, isValidHmTime, isValidYmdDate } from "./timezone";
import type {
  ActivePinConfig,
  ActiveRecipientConfig,
  ActiveSenderConfig,
  ActivityLogEntry,
  ActivityLogResult,
  ActivityLogType,
  AttendanceScheduleConfig,
  AttendanceStage,
  AttendanceStatusRecord,
  BotPauseConfig,
  ConfirmedBy,
  CronHealthSummary,
  CronPingRecord,
  CustomMessageConfig,
  CustomMessageScope,
  FriendContact,
  OffDayEntry,
  OtpPurpose,
  ResetOtpRecord,
  ScheduleStageConfig,
  TodayOffDayStatus,
  VerificationTicketRecord,
} from "./types";

export const ATTENDANCE_STATUS_TTL_SECONDS = 172_800; // 48 jam
export const ATTENDANCE_SENT_TTL_SECONDS = 86_400; // 24 jam
export const AUTH_RATELIMIT_TTL_SECONDS = 900; // 15 menit
export const AUTH_RATELIMIT_MAX_ATTEMPTS = 5;
export const AUTH_OTP_TTL_SECONDS = 600; // 10 menit
export const AUTH_OTP_MAX_ATTEMPTS = 5;
export const AUTH_TICKET_TTL_SECONDS = 300; // 5 menit
export const AUTH_OTP_COOLDOWN_SECONDS = 60;
export const AUTH_OTP_RATELIMIT_TTL_SECONDS = 900; // 15 menit
export const AUTH_OTP_RATELIMIT_MAX_REQUESTS = 3;
export const ACTIVITY_LOG_MAX_ENTRIES = 30;

const REDIS_KEYS = {
  attendanceStatus: (dateWib: string) => `absen:status:${dateWib}`,
  attendanceSent: (dateWib: string, stage: AttendanceStage) => `absen:sent:${dateWib}:${stage}`,
  botPaused: "bot:config:paused",
  botRecipient: "bot:config:recipient",
  botSender: "bot:config:sender",
  botCustomMessage: "bot:config:custom_message",
  botOffDays: "bot:config:off_days",
  botSchedule: "bot:config:schedule",
  dashboardVersion: "bot:meta:version",
  lastCronPing: "bot:meta:last_cron_ping",
  friendContacts: "contacts:friends",
  activityLogs: "logs:activity",
  authPinConfig: "auth:config:pin",
  authSessionVersion: SESSION_VERSION_REDIS_KEY,
  authPurposeOtp: (purpose: OtpPurpose) => `auth:otp:${purpose}`,
  authPurposeTicket: (purpose: OtpPurpose) => `auth:ticket:${purpose}`,
  authPurposeCooldown: (purpose: OtpPurpose) => `auth:otp:cooldown:${purpose}`,
  authPurposeRateLimit: (purpose: OtpPurpose, ipHash: string) =>
    `auth:otp:ratelimit:${purpose}:${ipHash}`,
  authRateLimit: (ipHash: string) => `auth:ratelimit:${ipHash}`,
} as const;

// Upstash REST SDK dapat mengembalikan JSON dalam bentuk object ter-parse atau string mentah.
function parseStoredJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as T;
  }
  return null;
}

export async function getAttendanceStatus(dateWib: string): Promise<AttendanceStatusRecord | null> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.attendanceStatus(dateWib));
  const parsed = parseStoredJson<AttendanceStatusRecord>(raw);
  if (!parsed || parsed.status !== "confirmed") {
    return null;
  }
  return parsed;
}

function generateVersionToken(): string {
  return `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function getDashboardVersion(): Promise<string> {
  const redis = getRedis();
  const raw = await redis.get<string | number>(REDIS_KEYS.dashboardVersion);
  if (raw !== null && raw !== undefined && String(raw).trim().length > 0) {
    return String(raw);
  }

  const initial = generateVersionToken();
  await redis.set(REDIS_KEYS.dashboardVersion, initial);
  return initial;
}

export async function touchDashboardVersion(): Promise<string> {
  const redis = getRedis();
  const next = generateVersionToken();
  await redis.set(REDIS_KEYS.dashboardVersion, next);
  return next;
}

export async function setAttendanceConfirmed(
  dateWib: string,
  confirmedBy: ConfirmedBy,
): Promise<{ record: AttendanceStatusRecord; alreadyConfirmed: boolean }> {
  const existing = await getAttendanceStatus(dateWib);
  if (existing) {
    return { record: existing, alreadyConfirmed: true };
  }

  const record: AttendanceStatusRecord = {
    status: "confirmed",
    confirmedAt: getNowWibIso(),
    confirmedBy,
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.attendanceStatus(dateWib), JSON.stringify(record), {
    ex: ATTENDANCE_STATUS_TTL_SECONDS,
  });
  await touchDashboardVersion();

  return { record, alreadyConfirmed: false };
}

export async function resetAttendanceStatus(
  dateWib: string,
  clearSentLocks = false,
): Promise<void> {
  const redis = getRedis();
  const keysToDelete: string[] = [REDIS_KEYS.attendanceStatus(dateWib)];

  if (clearSentLocks) {
    keysToDelete.push(
      REDIS_KEYS.attendanceSent(dateWib, "morning"),
      REDIS_KEYS.attendanceSent(dateWib, "afternoon"),
      REDIS_KEYS.attendanceSent(dateWib, "urgent"),
    );
  }

  await redis.del(...keysToDelete);
  await touchDashboardVersion();
}

export async function getStageSentAt(
  dateWib: string,
  stage: AttendanceStage,
): Promise<string | null> {
  const redis = getRedis();
  const raw = await redis.get<string>(REDIS_KEYS.attendanceSent(dateWib, stage));
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function getAllStageSentAt(
  dateWib: string,
): Promise<Record<AttendanceStage, string | null>> {
  const redis = getRedis();
  const values = await redis.mget<(string | null)[]>(
    REDIS_KEYS.attendanceSent(dateWib, "morning"),
    REDIS_KEYS.attendanceSent(dateWib, "afternoon"),
    REDIS_KEYS.attendanceSent(dateWib, "urgent"),
  );

  const normalize = (val: unknown): string | null =>
    typeof val === "string" && val.length > 0 ? val : null;

  return {
    morning: normalize(values[0]),
    afternoon: normalize(values[1]),
    urgent: normalize(values[2]),
  };
}

export async function setStageSentLock(
  dateWib: string,
  stage: AttendanceStage,
  sentAtWib: string = getNowWibIso(),
): Promise<string> {
  const redis = getRedis();
  await redis.set(REDIS_KEYS.attendanceSent(dateWib, stage), sentAtWib, {
    ex: ATTENDANCE_SENT_TTL_SECONDS,
  });
  await touchDashboardVersion();
  return sentAtWib;
}

export async function getBotPauseConfig(): Promise<BotPauseConfig> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.botPaused);
  const parsed = parseStoredJson<BotPauseConfig>(raw);

  if (!parsed || typeof parsed.paused !== "boolean") {
    return { paused: false, updatedAt: "" };
  }

  return {
    paused: parsed.paused,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    ...(parsed.note ? { note: parsed.note } : {}),
  };
}

export async function setBotPauseConfig(
  paused: boolean,
  note?: string,
): Promise<BotPauseConfig> {
  const cleanNote = note?.trim();
  const config: BotPauseConfig = {
    paused,
    updatedAt: getNowWibIso(),
    ...(paused && cleanNote ? { note: cleanNote } : {}),
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.botPaused, JSON.stringify(config));
  await touchDashboardVersion();
  return config;
}

export async function getActiveRecipient(): Promise<ActiveRecipientConfig> {
  const env = getEnv();
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.botRecipient);
  const parsed = parseStoredJson<ActiveRecipientConfig>(raw);

  if (
    parsed &&
    typeof parsed.name === "string" &&
    parsed.name.trim().length > 0 &&
    typeof parsed.email === "string" &&
    parsed.email.trim().length > 0
  ) {
    return {
      name: parsed.name.trim(),
      email: parsed.email.trim().toLowerCase(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  }

  return {
    name: env.PARTNER_NAME,
    email: env.PARTNER_EMAIL,
    updatedAt: "",
  };
}

export async function setActiveRecipient(input: {
  name: string;
  email: string;
}): Promise<ActiveRecipientConfig> {
  const config: ActiveRecipientConfig = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    updatedAt: getNowWibIso(),
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.botRecipient, JSON.stringify(config));

  await appendActivityLog({
    type: "recipient_updated",
    summary: `Penerima aktif diperbarui ke ${config.name} (${config.email}).`,
    result: "success",
  });

  return config;
}

export async function getActiveSenderName(): Promise<string> {
  const env = getEnv();
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.botSender);
  const parsed = parseStoredJson<ActiveSenderConfig>(raw);

  if (parsed && typeof parsed.name === "string" && parsed.name.trim().length > 0) {
    return sanitizeSenderDisplayName(parsed.name, env.SENDER_NAME);
  }

  return sanitizeSenderDisplayName(env.SENDER_NAME);
}

export async function setActiveSenderName(name: string): Promise<ActiveSenderConfig> {
  const env = getEnv();
  const sanitized = sanitizeSenderDisplayName(name, env.SENDER_NAME);
  const config: ActiveSenderConfig = {
    name: sanitized,
    updatedAt: getNowWibIso(),
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.botSender, JSON.stringify(config));

  await appendActivityLog({
    type: "sender_updated",
    summary: `Nama pengirim default diperbarui ke "${config.name}".`,
    result: "success",
  });

  return config;
}

export async function getActiveCustomMessage(
  todayWib: string,
): Promise<CustomMessageConfig | null> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.botCustomMessage);
  const parsed = parseStoredJson<CustomMessageConfig>(raw);

  if (!parsed || typeof parsed.message !== "string" || parsed.message.trim().length === 0) {
    return null;
  }

  const scope: CustomMessageScope = parsed.scope === "always" ? "always" : "today_only";
  if (scope === "today_only" && parsed.activeDate !== todayWib) {
    return null;
  }

  return {
    message: parsed.message.trim(),
    scope,
    ...(parsed.activeDate ? { activeDate: parsed.activeDate } : {}),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
  };
}

export async function clearCustomMessage(): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEYS.botCustomMessage);

  await appendActivityLog({
    type: "message_updated",
    summary: "Pesan khusus pengingat dihapus.",
    result: "success",
  });
}

export async function setCustomMessage(input: {
  message: string;
  scope: CustomMessageScope;
  todayWib: string;
}): Promise<CustomMessageConfig | null> {
  const trimmed = input.message.trim();
  if (!trimmed) {
    await clearCustomMessage();
    return null;
  }

  const config: CustomMessageConfig = {
    message: trimmed,
    scope: input.scope,
    ...(input.scope === "today_only" ? { activeDate: input.todayWib } : {}),
    updatedAt: getNowWibIso(),
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.botCustomMessage, JSON.stringify(config));

  const scopeLabel = input.scope === "today_only" ? `hari ini (${input.todayWib})` : "permanen";
  await appendActivityLog({
    type: "message_updated",
    summary: `Pesan khusus pengingat disimpan (${scopeLabel}).`,
    result: "success",
  });

  return config;
}

export async function isOffDay(dateWib: string): Promise<TodayOffDayStatus> {
  const redis = getRedis();
  const raw = await redis.hget(REDIS_KEYS.botOffDays, dateWib);
  const parsed = parseStoredJson<OffDayEntry>(raw);

  if (!parsed || parsed.date !== dateWib) {
    return { isOff: false };
  }

  return {
    isOff: true,
    ...(parsed.note ? { note: parsed.note } : {}),
  };
}

export async function getUpcomingOffDays(todayWib: string): Promise<OffDayEntry[]> {
  const redis = getRedis();
  const rawHash = await redis.hgetall<Record<string, unknown>>(REDIS_KEYS.botOffDays);
  if (!rawHash) {
    return [];
  }

  const pastFields: string[] = [];
  const upcoming: OffDayEntry[] = [];

  for (const [field, value] of Object.entries(rawHash)) {
    const parsed = parseStoredJson<OffDayEntry>(value);
    const entryDate = parsed?.date && isValidYmdDate(parsed.date) ? parsed.date : field;

    if (!isValidYmdDate(entryDate) || entryDate < todayWib) {
      pastFields.push(field);
      continue;
    }

    upcoming.push({
      date: entryDate,
      ...(parsed?.note?.trim() ? { note: parsed.note.trim() } : {}),
      createdAt: typeof parsed?.createdAt === "string" ? parsed.createdAt : "",
    });
  }

  if (pastFields.length > 0) {
    await redis.hdel(REDIS_KEYS.botOffDays, ...pastFields);
  }

  return upcoming.sort((a, b) => a.date.localeCompare(b.date));
}

export async function addOffDays(
  items: Array<{ date: string; note?: string }>,
): Promise<OffDayEntry[]> {
  if (items.length === 0) {
    return [];
  }

  const createdAt = getNowWibIso();
  const deduped = new Map<string, OffDayEntry>();

  for (const item of items) {
    const cleanNote = item.note?.trim();
    deduped.set(item.date, {
      date: item.date,
      ...(cleanNote ? { note: cleanNote } : {}),
      createdAt,
    });
  }

  const entries = Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
  const payload: Record<string, string> = {};
  for (const entry of entries) {
    payload[entry.date] = JSON.stringify(entry);
  }

  const redis = getRedis();
  await redis.hset(REDIS_KEYS.botOffDays, payload);

  const dateSummary =
    entries.length === 1
      ? `${entries[0]?.date}${entries[0]?.note ? ` (${entries[0].note})` : ""}`
      : `${entries.length} tanggal (${entries[0]?.date} s.d. ${entries[entries.length - 1]?.date})`;

  await appendActivityLog({
    type: "off_days_updated",
    summary: `Tanggal libur ditambahkan: ${dateSummary}.`,
    result: "success",
  });

  return entries;
}

export async function removeOffDay(dateWib: string): Promise<boolean> {
  const redis = getRedis();
  const removed = await redis.hdel(REDIS_KEYS.botOffDays, dateWib);

  if (removed > 0) {
    await appendActivityLog({
      type: "off_days_updated",
      summary: `Tanggal libur dibatalkan: ${dateWib}.`,
      result: "success",
    });
    return true;
  }

  return false;
}

export const DEFAULT_ATTENDANCE_SCHEDULE: AttendanceScheduleConfig = {
  morning: { enabled: true, time: "09:00" },
  afternoon: { enabled: true, time: "15:00" },
  urgent: { enabled: true, time: "20:30" },
  updatedAt: "",
};

function sanitizeStageConfig(
  raw: Partial<ScheduleStageConfig> | undefined,
  fallback: ScheduleStageConfig,
): ScheduleStageConfig {
  if (
    raw &&
    typeof raw.enabled === "boolean" &&
    typeof raw.time === "string" &&
    isValidHmTime(raw.time)
  ) {
    return { enabled: raw.enabled, time: raw.time };
  }
  return { ...fallback };
}

export async function getActiveSchedule(): Promise<AttendanceScheduleConfig> {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEYS.botSchedule);
  const parsed = parseStoredJson<Partial<AttendanceScheduleConfig>>(raw);

  if (!parsed) {
    return {
      morning: { ...DEFAULT_ATTENDANCE_SCHEDULE.morning },
      afternoon: { ...DEFAULT_ATTENDANCE_SCHEDULE.afternoon },
      urgent: { ...DEFAULT_ATTENDANCE_SCHEDULE.urgent },
      updatedAt: "",
    };
  }

  return {
    morning: sanitizeStageConfig(parsed.morning, DEFAULT_ATTENDANCE_SCHEDULE.morning),
    afternoon: sanitizeStageConfig(parsed.afternoon, DEFAULT_ATTENDANCE_SCHEDULE.afternoon),
    urgent: sanitizeStageConfig(parsed.urgent, DEFAULT_ATTENDANCE_SCHEDULE.urgent),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
  };
}

export async function setActiveSchedule(input: {
  morning: ScheduleStageConfig;
  afternoon: ScheduleStageConfig;
  urgent: ScheduleStageConfig;
}): Promise<AttendanceScheduleConfig> {
  const config: AttendanceScheduleConfig = {
    morning: { enabled: input.morning.enabled, time: input.morning.time },
    afternoon: { enabled: input.afternoon.enabled, time: input.afternoon.time },
    urgent: { enabled: input.urgent.enabled, time: input.urgent.time },
    updatedAt: getNowWibIso(),
  };

  const redis = getRedis();
  await redis.set(REDIS_KEYS.botSchedule, JSON.stringify(config));

  const parts: string[] = [
    `Pagi ${config.morning.enabled ? config.morning.time : "nonaktif"}`,
    `Sore ${config.afternoon.enabled ? config.afternoon.time : "nonaktif"}`,
    `Urgent ${config.urgent.enabled ? config.urgent.time : "nonaktif"}`,
  ];

  await appendActivityLog({
    type: "schedule_updated",
    summary: `Jadwal pengingat diperbarui (${parts.join(", ")} WIB).`,
    result: "success",
  });

  return config;
}

export async function appendActivityLogIfNotDuplicate(input: {
  type: ActivityLogType;
  summary: string;
  result: ActivityLogResult;
}): Promise<ActivityLogEntry | null> {
  const latest = await getRecentActivityLogs(1);
  if (latest[0] && latest[0].type === input.type && latest[0].summary === input.summary) {
    return null;
  }
  return appendActivityLog(input);
}

export const CRON_HEALTHY_MAX_AGE_MINUTES = 35;

export async function recordCronPing(input: {
  status: string;
  stageTriggered?: string | null;
  source?: string | null;
}): Promise<CronPingRecord> {
  const now = new Date();
  const record: CronPingRecord = {
    timestamp: now.toISOString(),
    wibTime: getNowWibTimeLabel(now),
    status: input.status,
    stageTriggered: input.stageTriggered ?? null,
    source: input.source ?? null,
  };
  const redis = getRedis();
  await redis.set(REDIS_KEYS.lastCronPing, JSON.stringify(record));
  return record;
}

export function buildCronHealthSummary(
  rawPing: unknown,
  now: Date = new Date(),
): CronHealthSummary {
  const parsed = parseStoredJson<CronPingRecord>(rawPing);
  if (!parsed || typeof parsed.timestamp !== "string") {
    return {
      status: "never",
      lastPingAt: null,
      lastPingWib: null,
      lastStatus: null,
      stageTriggered: null,
      source: null,
      minutesSinceLastPing: null,
    };
  }

  const pingMs = Date.parse(parsed.timestamp);
  if (!Number.isFinite(pingMs)) {
    return {
      status: "never",
      lastPingAt: null,
      lastPingWib: null,
      lastStatus: null,
      stageTriggered: null,
      source: null,
      minutesSinceLastPing: null,
    };
  }

  const minutesSinceLastPing = Math.max(0, Math.floor((now.getTime() - pingMs) / 60_000));
  return {
    status: minutesSinceLastPing <= CRON_HEALTHY_MAX_AGE_MINUTES ? "healthy" : "delayed",
    lastPingAt: parsed.timestamp,
    lastPingWib: typeof parsed.wibTime === "string" ? parsed.wibTime : getNowWibTimeLabel(new Date(pingMs)),
    lastStatus: typeof parsed.status === "string" ? parsed.status : null,
    stageTriggered: typeof parsed.stageTriggered === "string" ? parsed.stageTriggered : null,
    source: typeof parsed.source === "string" ? parsed.source : null,
    minutesSinceLastPing,
  };
}

export interface DashboardRawSnapshot {
  attendance: AttendanceStatusRecord | null;
  sentMap: Record<AttendanceStage, string | null>;
  pauseConfig: BotPauseConfig;
  logs: ActivityLogEntry[];
  recipient: ActiveRecipientConfig;
  senderName: string;
  pinMigrationRecommended: boolean;
  customMessage: CustomMessageConfig | null;
  upcomingOffDays: OffDayEntry[];
  schedule: AttendanceScheduleConfig;
  cronHealth: CronHealthSummary;
  version: string;
}

// Ambil seluruh state dashboard dalam 1 round-trip HTTP pipeline untuk efisiensi kuota Upstash REST.
export async function getDashboardSnapshotViaPipeline(
  todayWib: string,
): Promise<DashboardRawSnapshot> {
  const env = getEnv();
  const redis = getRedis();
  const pipeline = redis.pipeline();

  pipeline.get(REDIS_KEYS.attendanceStatus(todayWib));
  pipeline.get(REDIS_KEYS.attendanceSent(todayWib, "morning"));
  pipeline.get(REDIS_KEYS.attendanceSent(todayWib, "afternoon"));
  pipeline.get(REDIS_KEYS.attendanceSent(todayWib, "urgent"));
  pipeline.get(REDIS_KEYS.botPaused);
  pipeline.lrange(REDIS_KEYS.activityLogs, 0, 14);
  pipeline.get(REDIS_KEYS.botRecipient);
  pipeline.get(REDIS_KEYS.botCustomMessage);
  pipeline.hgetall(REDIS_KEYS.botOffDays);
  pipeline.get(REDIS_KEYS.botSchedule);
  pipeline.get(REDIS_KEYS.dashboardVersion);
  pipeline.get(REDIS_KEYS.botSender);
  pipeline.get(REDIS_KEYS.authPinConfig);
  pipeline.get(REDIS_KEYS.lastCronPing);

  const results = await pipeline.exec<unknown[]>();

  const rawAttendance = parseStoredJson<AttendanceStatusRecord>(results[0]);
  const attendance =
    rawAttendance && rawAttendance.status === "confirmed" ? rawAttendance : null;

  const normalizeSent = (val: unknown): string | null =>
    typeof val === "string" && val.length > 0 ? val : null;
  const sentMap: Record<AttendanceStage, string | null> = {
    morning: normalizeSent(results[1]),
    afternoon: normalizeSent(results[2]),
    urgent: normalizeSent(results[3]),
  };

  const rawPause = parseStoredJson<BotPauseConfig>(results[4]);
  const pauseConfig: BotPauseConfig =
    rawPause && typeof rawPause.paused === "boolean"
      ? {
          paused: rawPause.paused,
          updatedAt: typeof rawPause.updatedAt === "string" ? rawPause.updatedAt : "",
          ...(rawPause.note ? { note: rawPause.note } : {}),
        }
      : { paused: false, updatedAt: "" };

  const rawLogs = Array.isArray(results[5]) ? results[5] : [];
  const logs: ActivityLogEntry[] = [];
  for (const item of rawLogs) {
    const parsed = parseStoredJson<ActivityLogEntry>(item);
    if (parsed && parsed.id && parsed.summary) {
      logs.push(parsed);
    }
  }

  const rawRecipient = parseStoredJson<ActiveRecipientConfig>(results[6]);
  const recipient: ActiveRecipientConfig =
    rawRecipient &&
    typeof rawRecipient.name === "string" &&
    rawRecipient.name.trim().length > 0 &&
    typeof rawRecipient.email === "string" &&
    rawRecipient.email.trim().length > 0
      ? {
          name: rawRecipient.name.trim(),
          email: rawRecipient.email.trim().toLowerCase(),
          updatedAt: typeof rawRecipient.updatedAt === "string" ? rawRecipient.updatedAt : "",
        }
      : { name: env.PARTNER_NAME, email: env.PARTNER_EMAIL, updatedAt: "" };

  const rawMsg = parseStoredJson<CustomMessageConfig>(results[7]);
  let customMessage: CustomMessageConfig | null = null;
  if (rawMsg && typeof rawMsg.message === "string" && rawMsg.message.trim().length > 0) {
    const scope: CustomMessageScope = rawMsg.scope === "always" ? "always" : "today_only";
    if (scope === "always" || rawMsg.activeDate === todayWib) {
      customMessage = {
        message: rawMsg.message.trim(),
        scope,
        ...(rawMsg.activeDate ? { activeDate: rawMsg.activeDate } : {}),
        updatedAt: typeof rawMsg.updatedAt === "string" ? rawMsg.updatedAt : "",
      };
    }
  }

  const rawOffDays =
    results[8] && typeof results[8] === "object"
      ? (results[8] as Record<string, unknown>)
      : null;
  const pastOffFields: string[] = [];
  const upcomingOffDays: OffDayEntry[] = [];
  if (rawOffDays) {
    for (const [field, value] of Object.entries(rawOffDays)) {
      const parsed = parseStoredJson<OffDayEntry>(value);
      const entryDate = parsed?.date && isValidYmdDate(parsed.date) ? parsed.date : field;
      if (!isValidYmdDate(entryDate) || entryDate < todayWib) {
        pastOffFields.push(field);
        continue;
      }
      upcomingOffDays.push({
        date: entryDate,
        ...(parsed?.note?.trim() ? { note: parsed.note.trim() } : {}),
        createdAt: typeof parsed?.createdAt === "string" ? parsed.createdAt : "",
      });
    }
    upcomingOffDays.sort((a, b) => a.date.localeCompare(b.date));
    if (pastOffFields.length > 0) {
      await redis.hdel(REDIS_KEYS.botOffDays, ...pastOffFields);
    }
  }

  const rawSchedule = parseStoredJson<Partial<AttendanceScheduleConfig>>(results[9]);
  const schedule: AttendanceScheduleConfig = rawSchedule
    ? {
        morning: sanitizeStageConfig(rawSchedule.morning, DEFAULT_ATTENDANCE_SCHEDULE.morning),
        afternoon: sanitizeStageConfig(rawSchedule.afternoon, DEFAULT_ATTENDANCE_SCHEDULE.afternoon),
        urgent: sanitizeStageConfig(rawSchedule.urgent, DEFAULT_ATTENDANCE_SCHEDULE.urgent),
        updatedAt: typeof rawSchedule.updatedAt === "string" ? rawSchedule.updatedAt : "",
      }
    : {
        morning: { ...DEFAULT_ATTENDANCE_SCHEDULE.morning },
        afternoon: { ...DEFAULT_ATTENDANCE_SCHEDULE.afternoon },
        urgent: { ...DEFAULT_ATTENDANCE_SCHEDULE.urgent },
        updatedAt: "",
      };

  const rawVersion = results[10];
  let version =
    rawVersion !== null && rawVersion !== undefined && String(rawVersion).trim().length > 0
      ? String(rawVersion)
      : "";
  if (!version) {
    version = generateVersionToken();
    await redis.set(REDIS_KEYS.dashboardVersion, version);
  }

  const rawSender = parseStoredJson<ActiveSenderConfig>(results[11]);
  const senderName =
    rawSender && typeof rawSender.name === "string" && rawSender.name.trim().length > 0
      ? sanitizeSenderDisplayName(rawSender.name, env.SENDER_NAME)
      : sanitizeSenderDisplayName(env.SENDER_NAME);

  const rawPinConfig = parseStoredJson<ActivePinConfig>(results[12]);
  const hasCustomPin = Boolean(
    rawPinConfig &&
      typeof rawPinConfig.hash === "string" &&
      rawPinConfig.hash.startsWith("scrypt$") &&
      rawPinConfig.length === 6,
  );

  const cronHealth = buildCronHealthSummary(results[13]);

  return {
    attendance,
    sentMap,
    pauseConfig,
    logs,
    recipient,
    senderName,
    pinMigrationRecommended: !hasCustomPin,
    customMessage,
    upcomingOffDays,
    schedule,
    cronHealth,
    version,
  };
}

export async function listFriendContacts(): Promise<FriendContact[]> {
  const redis = getRedis();
  const rawHash = await redis.hgetall<Record<string, unknown>>(REDIS_KEYS.friendContacts);
  if (!rawHash) {
    return [];
  }

  const contacts: FriendContact[] = [];
  for (const value of Object.values(rawHash)) {
    const parsed = parseStoredJson<FriendContact>(value);
    if (parsed && parsed.id && parsed.email) {
      contacts.push(parsed);
    }
  }

  return contacts.sort((a, b) => {
    const groupCmp = a.group.localeCompare(b.group, "id");
    if (groupCmp !== 0) {
      return groupCmp;
    }
    return a.name.localeCompare(b.name, "id");
  });
}

export async function getFriendContactById(id: string): Promise<FriendContact | null> {
  const redis = getRedis();
  const raw = await redis.hget(REDIS_KEYS.friendContacts, id);
  const parsed = parseStoredJson<FriendContact>(raw);
  if (!parsed || !parsed.id || !parsed.email) {
    return null;
  }
  return parsed;
}

export async function createFriendContact(input: {
  name: string;
  email: string;
  group: string;
}): Promise<FriendContact> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await listFriendContacts();
  if (existing.some((item) => item.email.toLowerCase() === normalizedEmail)) {
    throw new Error("DUPLICATE_CONTACT_EMAIL");
  }

  const contact: FriendContact = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: normalizedEmail,
    group: input.group.trim() || "Umum",
    createdAt: getNowWibIso(),
  };

  const redis = getRedis();
  await redis.hset(REDIS_KEYS.friendContacts, {
    [contact.id]: JSON.stringify(contact),
  });

  return contact;
}

export async function updateFriendContact(
  id: string,
  input: { name?: string; email?: string; group?: string },
): Promise<FriendContact | null> {
  const current = await getFriendContactById(id);
  if (!current) {
    return null;
  }

  const nextEmail = input.email ? input.email.trim().toLowerCase() : current.email;
  if (nextEmail !== current.email.toLowerCase()) {
    const allContacts = await listFriendContacts();
    if (allContacts.some((item) => item.id !== id && item.email.toLowerCase() === nextEmail)) {
      throw new Error("DUPLICATE_CONTACT_EMAIL");
    }
  }

  const updated: FriendContact = {
    ...current,
    name: input.name !== undefined ? input.name.trim() : current.name,
    email: nextEmail,
    group: input.group !== undefined ? input.group.trim() || "Umum" : current.group,
  };

  const redis = getRedis();
  await redis.hset(REDIS_KEYS.friendContacts, {
    [id]: JSON.stringify(updated),
  });

  return updated;
}

export async function deleteFriendContact(id: string): Promise<boolean> {
  const redis = getRedis();
  const removed = await redis.hdel(REDIS_KEYS.friendContacts, id);
  return removed > 0;
}

export async function appendActivityLog(input: {
  type: ActivityLogType;
  summary: string;
  result: ActivityLogResult;
}): Promise<ActivityLogEntry> {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    timestamp: getNowWibIso(),
    type: input.type,
    summary: input.summary,
    result: input.result,
  };

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.lpush(REDIS_KEYS.activityLogs, JSON.stringify(entry));
  pipeline.ltrim(REDIS_KEYS.activityLogs, 0, ACTIVITY_LOG_MAX_ENTRIES - 1);
  pipeline.set(REDIS_KEYS.dashboardVersion, generateVersionToken());
  await pipeline.exec();

  return entry;
}

export async function getRecentActivityLogs(limit = 15): Promise<ActivityLogEntry[]> {
  const redis = getRedis();
  const safeLimit = Math.max(1, Math.min(limit, ACTIVITY_LOG_MAX_ENTRIES));
  const rawItems = await redis.lrange(REDIS_KEYS.activityLogs, 0, safeLimit - 1);

  const logs: ActivityLogEntry[] = [];
  for (const item of rawItems) {
    const parsed = parseStoredJson<ActivityLogEntry>(item);
    if (parsed && parsed.id && parsed.summary) {
      logs.push(parsed);
    }
  }
  return logs;
}

export interface RateLimitState {
  blocked: boolean;
  attempts: number;
  remainingAttempts: number;
}

export async function getLoginRateLimitState(ipHash: string): Promise<RateLimitState> {
  const redis = getRedis();
  const raw = await redis.get<number | string>(REDIS_KEYS.authRateLimit(ipHash));
  const attempts = Number(raw ?? 0);
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? attempts : 0;

  return {
    blocked: safeAttempts >= AUTH_RATELIMIT_MAX_ATTEMPTS,
    attempts: safeAttempts,
    remainingAttempts: Math.max(0, AUTH_RATELIMIT_MAX_ATTEMPTS - safeAttempts),
  };
}

export async function recordFailedLoginAttempt(ipHash: string): Promise<RateLimitState> {
  const redis = getRedis();
  const key = REDIS_KEYS.authRateLimit(ipHash);
  const attempts = await redis.incr(key);

  if (attempts === 1) {
    await redis.expire(key, AUTH_RATELIMIT_TTL_SECONDS);
  }

  return {
    blocked: attempts >= AUTH_RATELIMIT_MAX_ATTEMPTS,
    attempts,
    remainingAttempts: Math.max(0, AUTH_RATELIMIT_MAX_ATTEMPTS - attempts),
  };
}

export async function clearLoginRateLimit(ipHash: string): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEYS.authRateLimit(ipHash));
}

export async function getActivePinConfig(): Promise<ActivePinConfig | null> {
  const redis = getRedis();
  const parsed = parseStoredJson<ActivePinConfig>(await redis.get(REDIS_KEYS.authPinConfig));
  if (parsed && typeof parsed.hash === "string" && parsed.hash.startsWith("scrypt$") && parsed.length === 6) {
    return parsed;
  }
  return null;
}

export async function verifyActivePin(inputPin: string): Promise<{
  valid: boolean;
  usesCustomPin: boolean;
}> {
  const activeConfig = await getActivePinConfig();
  if (activeConfig) {
    const valid = /^\d{6}$/.test(inputPin) && verifyPinScrypt(inputPin, activeConfig.hash);
    return { valid, usesCustomPin: true };
  }
  return {
    valid: verifyPin(inputPin),
    usesCustomPin: false,
  };
}

export async function getSessionVersion(): Promise<string> {
  const redis = getRedis();
  const raw = await redis.get<string | number>(REDIS_KEYS.authSessionVersion);
  if (raw !== null && raw !== undefined && String(raw).trim().length > 0) {
    return String(raw).trim();
  }
  return "1";
}

export async function rotateSessionVersion(): Promise<string> {
  const nextVersion = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const redis = getRedis();
  await redis.set(REDIS_KEYS.authSessionVersion, nextVersion);
  return nextVersion;
}

export async function setActivePinConfig(
  newPin: string,
  logType: "pin_updated" | "pin_reset" = "pin_updated",
): Promise<{ sessionVersion: string; updatedAt: string }> {
  const updatedAt = getNowWibIso();
  const config: ActivePinConfig = {
    hash: hashPinScrypt(newPin),
    length: 6,
    updatedAt,
  };
  const nextSessionVersion = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.set(REDIS_KEYS.authPinConfig, JSON.stringify(config));
  pipeline.set(REDIS_KEYS.authSessionVersion, nextSessionVersion);
  await pipeline.exec();

  await appendActivityLog({
    type: logType,
    summary:
      logType === "pin_reset"
        ? "PIN akses dashboard berhasil di-reset melalui verifikasi OTP email."
        : "PIN akses dashboard berhasil diperbarui ke PIN 6 digit baru.",
    result: "success",
  });

  return { sessionVersion: nextSessionVersion, updatedAt };
}

export async function getOtpRateLimitState(
  purpose: OtpPurpose,
  ipHash: string,
): Promise<{
  blocked: boolean;
  requests: number;
  remainingRequests: number;
}> {
  const redis = getRedis();
  const raw = await redis.get<number | string>(REDIS_KEYS.authPurposeRateLimit(purpose, ipHash));
  const requests = Number(raw ?? 0);
  const safeRequests = Number.isFinite(requests) && requests > 0 ? requests : 0;

  return {
    blocked: safeRequests >= AUTH_OTP_RATELIMIT_MAX_REQUESTS,
    requests: safeRequests,
    remainingRequests: Math.max(0, AUTH_OTP_RATELIMIT_MAX_REQUESTS - safeRequests),
  };
}

export async function recordOtpRequest(purpose: OtpPurpose, ipHash: string): Promise<void> {
  const redis = getRedis();
  const key = REDIS_KEYS.authPurposeRateLimit(purpose, ipHash);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, AUTH_OTP_RATELIMIT_TTL_SECONDS);
  }
}

export async function getOtpCooldownRemaining(purpose: OtpPurpose): Promise<number> {
  const redis = getRedis();
  const ttl = await redis.ttl(REDIS_KEYS.authPurposeCooldown(purpose));
  return typeof ttl === "number" && ttl > 0 ? ttl : 0;
}

export async function setOtpCooldown(purpose: OtpPurpose): Promise<void> {
  const redis = getRedis();
  await redis.set(REDIS_KEYS.authPurposeCooldown(purpose), "1", {
    ex: AUTH_OTP_COOLDOWN_SECONDS,
  });
}

export async function clearOtpCooldown(purpose: OtpPurpose): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEYS.authPurposeCooldown(purpose));
}

export async function savePurposeOtp(
  purpose: OtpPurpose,
  otpHash: string,
  salt: string,
): Promise<void> {
  const record: ResetOtpRecord = {
    otpHash,
    salt,
    attempts: 0,
    createdAt: getNowWibIso(),
  };
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.set(REDIS_KEYS.authPurposeOtp(purpose), JSON.stringify(record), {
    ex: AUTH_OTP_TTL_SECONDS,
  });
  // Hapus tiket verifikasi lama agar permintaan OTP baru selalu memulai dari awal.
  pipeline.del(REDIS_KEYS.authPurposeTicket(purpose));
  await pipeline.exec();
}

export async function getPurposeOtp(purpose: OtpPurpose): Promise<ResetOtpRecord | null> {
  const redis = getRedis();
  const parsed = parseStoredJson<ResetOtpRecord>(await redis.get(REDIS_KEYS.authPurposeOtp(purpose)));
  if (
    parsed &&
    typeof parsed.otpHash === "string" &&
    typeof parsed.salt === "string" &&
    typeof parsed.attempts === "number"
  ) {
    return parsed;
  }
  return null;
}

export async function incrementPurposeOtpAttempts(
  purpose: OtpPurpose,
  current: ResetOtpRecord,
): Promise<{
  exhausted: boolean;
  remainingAttempts: number;
}> {
  const nextAttempts = current.attempts + 1;
  const redis = getRedis();
  const otpKey = REDIS_KEYS.authPurposeOtp(purpose);

  if (nextAttempts >= AUTH_OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey);
    return { exhausted: true, remainingAttempts: 0 };
  }

  const remainingTtl = await redis.ttl(otpKey);
  const ex = typeof remainingTtl === "number" && remainingTtl > 10 ? remainingTtl : 60;
  await redis.set(otpKey, JSON.stringify({ ...current, attempts: nextAttempts }), { ex });

  return {
    exhausted: false,
    remainingAttempts: Math.max(0, AUTH_OTP_MAX_ATTEMPTS - nextAttempts),
  };
}

export async function deletePurposeOtp(purpose: OtpPurpose): Promise<void> {
  const redis = getRedis();
  await redis.del(REDIS_KEYS.authPurposeOtp(purpose));
}

export async function issueVerificationTicket(purpose: OtpPurpose): Promise<{
  verificationToken: string;
  expiresInSeconds: number;
  expiresAt: string;
}> {
  const verificationToken = generateVerificationToken();
  const salt = crypto.randomBytes(16).toString("hex");
  const ticketHash = hashPurposeToken(purpose, verificationToken, salt);
  const nowMs = Date.now();
  const verifiedAt = getNowWibIso(new Date(nowMs));
  const expiresAt = getNowWibIso(new Date(nowMs + AUTH_TICKET_TTL_SECONDS * 1000));

  const record: VerificationTicketRecord = {
    ticketHash,
    salt,
    verifiedAt,
    expiresAt,
  };

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.del(REDIS_KEYS.authPurposeOtp(purpose));
  pipeline.set(REDIS_KEYS.authPurposeTicket(purpose), JSON.stringify(record), {
    ex: AUTH_TICKET_TTL_SECONDS,
  });
  await pipeline.exec();

  return {
    verificationToken,
    expiresInSeconds: AUTH_TICKET_TTL_SECONDS,
    expiresAt,
  };
}

export async function verifyVerificationTicket(
  purpose: OtpPurpose,
  token: string,
): Promise<boolean> {
  const redis = getRedis();
  const ticketKey = REDIS_KEYS.authPurposeTicket(purpose);
  const parsed = parseStoredJson<VerificationTicketRecord>(await redis.get(ticketKey));
  if (
    !parsed ||
    typeof parsed.ticketHash !== "string" ||
    typeof parsed.salt !== "string"
  ) {
    return false;
  }

  return verifyPurposeToken(purpose, token, parsed.salt, parsed.ticketHash);
}

export async function deleteVerificationTicket(purpose: OtpPurpose): Promise<boolean> {
  const redis = getRedis();
  const deleted = await redis.del(REDIS_KEYS.authPurposeTicket(purpose));
  return Number(deleted) > 0;
}

export async function consumeVerificationTicket(
  purpose: OtpPurpose,
  token: string,
): Promise<boolean> {
  const valid = await verifyVerificationTicket(purpose, token);
  if (!valid) {
    return false;
  }

  // Tiket bersifat single-use: hapus secara atomik dan pastikan tepat satu pemanggil yang mengonsumsinya.
  return deleteVerificationTicket(purpose);
}
