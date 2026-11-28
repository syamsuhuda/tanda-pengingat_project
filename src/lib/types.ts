export type AttendanceStage = "morning" | "afternoon" | "urgent";

export type ConfirmedBy = "email_link" | "dashboard_manual";

export interface AttendanceStatusRecord {
  status: "confirmed";
  confirmedAt: string;
  confirmedBy: ConfirmedBy;
}

export interface BotPauseConfig {
  paused: boolean;
  updatedAt: string;
  note?: string;
}

export type NotificationChannel = "email" | "whatsapp" | "both";

export interface ActiveRecipientConfig {
  name: string;
  email: string;
  whatsapp?: string;
  channel?: NotificationChannel;
  updatedAt: string;
}

export interface ActiveSenderConfig {
  name: string;
  updatedAt: string;
}

export type CustomMessageScope = "today_only" | "always";

export interface CustomMessageConfig {
  message: string;
  scope: CustomMessageScope;
  activeDate?: string;
  updatedAt: string;
}

export interface OffDayEntry {
  date: string;
  note?: string;
  createdAt: string;
}

export interface TodayOffDayStatus {
  isOff: boolean;
  note?: string;
}

export interface ScheduleStageConfig {
  enabled: boolean;
  time: string;
}

export interface AttendanceScheduleConfig {
  morning: ScheduleStageConfig;
  afternoon: ScheduleStageConfig;
  urgent: ScheduleStageConfig;
  updatedAt: string;
}

export type IcsStartOffsetMinutes = 10 | 15 | 20 | 30 | 45 | 60;
export type IcsDurationMinutes = 15 | 30 | 60;
export type IcsAlarmBeforeMinutes = 0 | 5 | 10 | 15 | 30;

export interface AttendanceIcsConfig {
  enabledStages: {
    morning: boolean;
    afternoon: boolean;
    urgent: boolean;
  };
  manualIncludeIcs: boolean;
  startOffsetMinutes: IcsStartOffsetMinutes;
  durationMinutes: IcsDurationMinutes;
  alarmBeforeMinutes: IcsAlarmBeforeMinutes;
  updatedAt: string;
}

export type BotHealthState =
  | "offline"
  | "config_error"
  | "paused"
  | "no_schedule"
  | "delivery_error"
  | "scheduler_down"
  | "scheduler_delayed"
  | "holiday"
  | "active";

export type BotHealthSeverity = "ok" | "warning" | "error";

export interface BotHealthErrorRecord {
  type: "smtp" | "cron" | "config";
  message: string;
  stage?: string;
  at: string;
}

export interface BotHealthCheckItem {
  ok: boolean;
  status: "ok" | "warning" | "error";
  label: string;
  detail: string;
}

export interface BotHealthSummary {
  state: BotHealthState;
  label: string;
  severity: BotHealthSeverity;
  summary: string;
  detail: string;
  checkedAt: string;
  checks: {
    redis: BotHealthCheckItem & { latencyMs?: number | null };
    env: BotHealthCheckItem;
    scheduler: BotHealthCheckItem;
    delivery: BotHealthCheckItem;
    schedule: BotHealthCheckItem;
  };
}

export interface FriendContact {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  group: string;
  createdAt: string;
}

export type ActivityLogType =
  | "cron_morning"
  | "cron_afternoon"
  | "cron_urgent"
  | "cron_skipped"
  | "manual_reminder"
  | "attendance_confirmed"
  | "attendance_reset"
  | "bot_pause"
  | "recipient_updated"
  | "sender_updated"
  | "message_updated"
  | "off_days_updated"
  | "schedule_updated"
  | "ics_config_updated"
  | "health_checked"
  | "itinerary_sent"
  | "contact_updated"
  | "pin_updated"
  | "pin_reset";

export interface ActivePinConfig {
  hash: string;
  length: 6;
  updatedAt: string;
}

export type OtpPurpose = "change_pin" | "forgot_reset";

export interface ResetOtpRecord {
  otpHash: string;
  salt: string;
  attempts: number;
  createdAt: string;
}

export interface VerificationTicketRecord {
  ticketHash: string;
  salt: string;
  verifiedAt: string;
  expiresAt: string;
}

export type ActivityLogResult = "success" | "skipped" | "partial" | "error";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityLogType;
  summary: string;
  result: ActivityLogResult;
}

export type TimelineStageStatus =
  | "sent"
  | "waiting"
  | "missed"
  | "cancelled"
  | "paused"
  | "off_day"
  | "disabled";

export interface TimelineStageItem {
  stage: AttendanceStage;
  label: string;
  scheduledTimeWib: string;
  status: TimelineStageStatus;
  sentAt: string | null;
}

export interface CronPingRecord {
  timestamp: string;
  wibTime: string;
  status: string;
  stageTriggered?: string | null;
  source?: string | null;
}

export type CronHealthStatus = "healthy" | "delayed" | "never";

export interface CronHealthSummary {
  status: CronHealthStatus;
  lastPingAt: string | null;
  lastPingWib: string | null;
  lastStatus: string | null;
  stageTriggered: string | null;
  source: string | null;
  minutesSinceLastPing: number | null;
}

export interface DashboardStatusData {
  unchanged?: false;
  version: string;
  serverTimeWib: string;
  todayWib: string;
  tomorrowWib: string;
  todayFormatted: string;
  nowWibIso: string;
  nowWibTime: string;
  partnerName: string;
  partnerEmail: string;
  senderName: string;
  pinMigrationRecommended: boolean;
  recipient: ActiveRecipientConfig;
  customMessage: CustomMessageConfig | null;
  todayOffDay: TodayOffDayStatus;
  upcomingOffDays: OffDayEntry[];
  schedule: AttendanceScheduleConfig;
  icsConfig: AttendanceIcsConfig;
  attendance: AttendanceStatusRecord | null;
  timeline: TimelineStageItem[];
  pauseConfig: BotPauseConfig;
  cronHealth: CronHealthSummary;
  botHealth: BotHealthSummary;
  logs: ActivityLogEntry[];
}

export interface DashboardUnchangedData {
  unchanged: true;
  version: string;
  serverTimeWib: string;
  todayWib: string;
}

export type DashboardStatusResponseData = DashboardStatusData | DashboardUnchangedData;

export type ItineraryRecipientMode = "date" | "event" | "friends";

export type NormalizedItineraryMode = "date" | "event";

export type ItineraryMessageTone = "formal" | "natural" | "casual" | "custom";

export type IcsBundleMode = "combined" | "separate";

export type AlarmMinutes = 15 | 30 | 60;

export interface ItinerarySessionInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName?: string;
  mapsUrl?: string;
  description?: string;
}

export interface ResolvedItinerarySession extends ItinerarySessionInput {
  endDateWib: string;
  crossesMidnight: boolean;
  durationMinutes: number;
  dtStartUtc: string;
  dtEndUtc: string;
}

export interface RecipientAddress {
  name?: string;
  email: string;
}

export interface ApiResponse<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
  error?: string;
}
