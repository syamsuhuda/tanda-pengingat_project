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
  | "itinerary_sent"
  | "contact_updated";

export type ActivityLogResult = "success" | "skipped" | "partial" | "error";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityLogType;
  summary: string;
  result: ActivityLogResult;
}

export type TimelineStageStatus = "sent" | "waiting" | "cancelled" | "paused";

export interface TimelineStageItem {
  stage: AttendanceStage;
  label: string;
  scheduledTimeWib: string;
  status: TimelineStageStatus;
  sentAt: string | null;
}

export interface DashboardStatusData {
  todayWib: string;
  todayFormatted: string;
  nowWibIso: string;
  nowWibTime: string;
  partnerName: string;
  partnerEmail: string;
  attendance: AttendanceStatusRecord | null;
  timeline: TimelineStageItem[];
  pauseConfig: BotPauseConfig;
  logs: ActivityLogEntry[];
}

export type ItineraryRecipientMode = "date" | "friends";

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
