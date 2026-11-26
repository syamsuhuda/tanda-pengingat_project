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

export interface ActiveRecipientConfig {
  name: string;
  email: string;
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

export interface FriendContact {
  id: string;
  name: string;
  email: string;
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

export type TimelineStageStatus = "sent" | "waiting" | "cancelled" | "paused" | "off_day" | "disabled";

export interface TimelineStageItem {
  stage: AttendanceStage;
  label: string;
  scheduledTimeWib: string;
  status: TimelineStageStatus;
  sentAt: string | null;
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
  attendance: AttendanceStatusRecord | null;
  timeline: TimelineStageItem[];
  pauseConfig: BotPauseConfig;
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
