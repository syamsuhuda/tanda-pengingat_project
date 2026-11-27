export const WIB_TIMEZONE = "Asia/Jakarta";
export const WIB_OFFSET_HOURS = 7;

const INDONESIAN_DAYS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const INDONESIAN_SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export interface WibDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const wibPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: WIB_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getWibDateParts(date: Date = new Date()): WibDateParts {
  const parts = wibPartsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute) % 60,
    second: Number(map.second) % 60,
  };
}

export function getTodayWibDate(now: Date = new Date()): string {
  const p = getWibDateParts(now);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function getNowWibIso(now: Date = new Date()): string {
  const p = getWibDateParts(now);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}+07:00`;
}

export function getNowWibTimeLabel(now: Date = new Date()): string {
  const p = getWibDateParts(now);
  return `${pad2(p.hour)}:${pad2(p.minute)} WIB`;
}

export function isValidYmdDate(ymd: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isValidHmTime(hm: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(hm);
}

export function parseYmdDate(ymd: string): { year: number; month: number; day: number } {
  if (!isValidYmdDate(ymd)) {
    throw new Error(`Format tanggal tidak valid (harus YYYY-MM-DD): ${ymd}`);
  }
  const [yearStr, monthStr, dayStr] = ymd.split("-");
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

export function parseHmTime(hm: string): { hour: number; minute: number } {
  if (!isValidHmTime(hm)) {
    throw new Error(`Format jam tidak valid (harus HH:mm): ${hm}`);
  }
  const [hourStr, minuteStr] = hm.split(":");
  return {
    hour: Number(hourStr),
    minute: Number(minuteStr),
  };
}

export function hmTimeToMinutes(hm: string): number {
  const { hour, minute } = parseHmTime(hm);
  return hour * 60 + minute;
}

export function addMinutesToHmTime(hm: string, deltaMinutes: number): string {
  const total = (((hmTimeToMinutes(hm) + deltaMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function getCurrentWibMinutes(now: Date = new Date()): number {
  const p = getWibDateParts(now);
  return p.hour * 60 + p.minute;
}

export function formatHmTimeWibLabel(hm: string): string {
  return `${hm} WIB`;
}

export const AUTO_DISPATCH_WINDOW_MINUTES = 120;

const STAGE_SEQUENCE: Array<"morning" | "afternoon" | "urgent"> = [
  "morning",
  "afternoon",
  "urgent",
];

type ScheduleLike = {
  morning: { enabled: boolean; time: string };
  afternoon: { enabled: boolean; time: string };
  urgent: { enabled: boolean; time: string };
};

export function resolveStageDispatchWindowEndMinutes(
  stage: "morning" | "afternoon" | "urgent",
  schedule: ScheduleLike,
): number {
  const stageMinutes = hmTimeToMinutes(schedule[stage].time);
  let windowEnd = Math.min(stageMinutes + AUTO_DISPATCH_WINDOW_MINUTES, 24 * 60 - 1);

  const stageIdx = STAGE_SEQUENCE.indexOf(stage);
  for (let i = stageIdx + 1; i < STAGE_SEQUENCE.length; i += 1) {
    const nextStage = STAGE_SEQUENCE[i];
    if (nextStage && schedule[nextStage].enabled) {
      const nextMinutes = hmTimeToMinutes(schedule[nextStage].time);
      if (nextMinutes > stageMinutes) {
        windowEnd = Math.min(windowEnd, nextMinutes - 1);
      }
      break;
    }
  }

  return windowEnd;
}

export function resolveDueAutoStage(
  nowMinutes: number,
  schedule: ScheduleLike,
  sentMap: Record<"morning" | "afternoon" | "urgent", string | null>,
): "morning" | "afternoon" | "urgent" | null {
  const priorityOrder: Array<"urgent" | "afternoon" | "morning"> = [
    "urgent",
    "afternoon",
    "morning",
  ];

  for (const stage of priorityOrder) {
    const stageConfig = schedule[stage];
    if (!stageConfig.enabled || sentMap[stage] !== null) {
      continue;
    }

    const stageMinutes = hmTimeToMinutes(stageConfig.time);
    const windowEnd = resolveStageDispatchWindowEndMinutes(stage, schedule);
    if (nowMinutes >= stageMinutes && nowMinutes <= windowEnd) {
      return stage;
    }
  }

  return null;
}

export function isStageMissedWib(
  nowMinutes: number,
  stage: "morning" | "afternoon" | "urgent",
  schedule: ScheduleLike,
): boolean {
  if (!schedule[stage].enabled) {
    return false;
  }
  const windowEnd = resolveStageDispatchWindowEndMinutes(stage, schedule);
  return nowMinutes > windowEnd;
}

export function shiftYmdDate(ymd: string, deltaDays: number): string {
  const { year, month, day } = parseYmdDate(ymd);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function getYesterdayWibDate(now: Date = new Date()): string {
  return shiftYmdDate(getTodayWibDate(now), -1);
}

export function isWithinAttendanceConfirmWindow(targetDate: string, now: Date = new Date()): boolean {
  if (!isValidYmdDate(targetDate)) {
    return false;
  }
  const today = getTodayWibDate(now);
  const yesterday = shiftYmdDate(today, -1);
  return targetDate === today || targetDate === yesterday;
}

// Asia/Jakarta tetap UTC+7 sepanjang tahun tanpa DST, sehingga pengurangan 7 jam bersifat deterministik.
export function wibDateTimeToUtcDate(ymd: string, hm: string, addDays = 0): Date {
  const { year, month, day } = parseYmdDate(ymd);
  const { hour, minute } = parseHmTime(hm);
  return new Date(Date.UTC(year, month - 1, day + addDays, hour - WIB_OFFSET_HOURS, minute, 0));
}

export function formatUtcDateForIcs(date: Date): string {
  return (
    `${date.getUTCFullYear()}` +
    `${pad2(date.getUTCMonth() + 1)}` +
    `${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}` +
    `${pad2(date.getUTCMinutes())}` +
    `${pad2(date.getUTCSeconds())}Z`
  );
}

export interface ResolvedWibUtcRange {
  startUtc: Date;
  endUtc: Date;
  dtStartUtc: string;
  dtEndUtc: string;
  endDateWib: string;
  crossesMidnight: boolean;
  durationMinutes: number;
}

export function resolveWibSessionUtcRange(
  date: string,
  startTime: string,
  endTime: string,
): ResolvedWibUtcRange {
  const start = parseHmTime(startTime);
  const end = parseHmTime(endTime);
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  if (startMinutes === endMinutes) {
    throw new Error("Jam selesai harus berbeda dari jam mulai.");
  }

  const crossesMidnight = endMinutes < startMinutes;
  const endDateWib = crossesMidnight ? shiftYmdDate(date, 1) : date;
  const durationMinutes = crossesMidnight
    ? 24 * 60 - startMinutes + endMinutes
    : endMinutes - startMinutes;

  const startUtc = wibDateTimeToUtcDate(date, startTime, 0);
  const endUtc = wibDateTimeToUtcDate(date, endTime, crossesMidnight ? 1 : 0);

  return {
    startUtc,
    endUtc,
    dtStartUtc: formatUtcDateForIcs(startUtc),
    dtEndUtc: formatUtcDateForIcs(endUtc),
    endDateWib,
    crossesMidnight,
    durationMinutes,
  };
}

export function formatWibDateIndonesian(ymd: string): string {
  const { year, month, day } = parseYmdDate(ymd);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dayName = INDONESIAN_DAYS[utcDay] ?? "";
  const monthName = INDONESIAN_MONTHS[month - 1] ?? "";
  return `${dayName}, ${day} ${monthName} ${year}`;
}

export function formatWibDateShortIndonesian(ymd: string): string {
  const { year, month, day } = parseYmdDate(ymd);
  const monthName = INDONESIAN_SHORT_MONTHS[month - 1] ?? "";
  return `${day} ${monthName} ${year}`;
}

export function formatWibDateCompactIndonesian(ymd: string): string {
  const { year, month, day } = parseYmdDate(ymd);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const dayName = INDONESIAN_DAYS[utcDay] ?? "";
  const monthName = INDONESIAN_SHORT_MONTHS[month - 1] ?? "";
  return `${dayName}, ${day} ${monthName} ${year}`;
}

export function formatIsoToWibTime(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  const p = getWibDateParts(parsed);
  return `${pad2(p.hour)}:${pad2(p.minute)} WIB`;
}

export function formatIsoToWibDateTime(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  const p = getWibDateParts(parsed);
  const monthName = INDONESIAN_SHORT_MONTHS[p.month - 1] ?? "";
  return `${p.day} ${monthName} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)} WIB`;
}

export function formatDurationIndonesian(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} menit`;
  }
  if (mins === 0) {
    return `${hours} jam`;
  }
  return `${hours} jam ${mins} menit`;
}

export function suggestNextSessionSlot(
  prevDate: string,
  prevStartTime: string,
  prevEndTime: string,
): { date: string; startTime: string; endTime: string } {
  const start = parseHmTime(prevStartTime);
  const end = parseHmTime(prevEndTime);
  const prevCrossedMidnight = end.hour * 60 + end.minute < start.hour * 60 + start.minute;
  const nextDate = prevCrossedMidnight ? shiftYmdDate(prevDate, 1) : prevDate;

  const nextStartMinutes = end.hour * 60 + end.minute;
  const nextEndMinutes = (nextStartMinutes + 60) % (24 * 60);

  return {
    date: nextDate,
    startTime: `${pad2(Math.floor(nextStartMinutes / 60))}:${pad2(nextStartMinutes % 60)}`,
    endTime: `${pad2(Math.floor(nextEndMinutes / 60))}:${pad2(nextEndMinutes % 60)}`,
  };
}

export function getManualAttendanceSlot(now: Date = new Date()): {
  date: string;
  startTime: string;
  endTime: string;
} {
  const p = getWibDateParts(now);
  const today = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  const nowMinutes = p.hour * 60 + p.minute;

  if (nowMinutes < 9 * 60 + 30) {
    return { date: today, startTime: "09:00", endTime: "09:30" };
  }

  // Bulatkan ke kelipatan 15 menit berikutnya agar pengingat manual langsung relevan di kalender.
  const roundedStart = Math.ceil(nowMinutes / 15) * 15;
  const effectiveStart = roundedStart >= 24 * 60 ? 23 * 60 + 45 : roundedStart;
  const effectiveEnd = (effectiveStart + 30) % (24 * 60);

  return {
    date: today,
    startTime: `${pad2(Math.floor(effectiveStart / 60))}:${pad2(effectiveStart % 60)}`,
    endTime: `${pad2(Math.floor(effectiveEnd / 60))}:${pad2(effectiveEnd % 60)}`,
  };
}
