import crypto from "node:crypto";
import { getRedis } from "./redis";
import { getNowWibIso } from "./timezone";
import type {
  ActivityLogEntry,
  ActivityLogResult,
  ActivityLogType,
  AttendanceStage,
  AttendanceStatusRecord,
  BotPauseConfig,
  ConfirmedBy,
  FriendContact,
} from "./types";

export const ATTENDANCE_STATUS_TTL_SECONDS = 172_800; // 48 jam
export const ATTENDANCE_SENT_TTL_SECONDS = 86_400; // 24 jam
export const AUTH_RATELIMIT_TTL_SECONDS = 900; // 15 menit
export const AUTH_RATELIMIT_MAX_ATTEMPTS = 5;
export const ACTIVITY_LOG_MAX_ENTRIES = 30;

const REDIS_KEYS = {
  attendanceStatus: (dateWib: string) => `absen:status:${dateWib}`,
  attendanceSent: (dateWib: string, stage: AttendanceStage) => `absen:sent:${dateWib}:${stage}`,
  botPaused: "bot:config:paused",
  friendContacts: "contacts:friends",
  activityLogs: "logs:activity",
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
  return config;
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
