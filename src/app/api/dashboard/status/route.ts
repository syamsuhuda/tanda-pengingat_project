import {
  handleRouteError,
  jsonOk,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import {
  getActiveCustomMessage,
  getActiveRecipient,
  getActiveSchedule,
  getAllStageSentAt,
  getAttendanceStatus,
  getBotPauseConfig,
  getRecentActivityLogs,
  getUpcomingOffDays,
} from "@/lib/store";
import {
  formatHmTimeWibLabel,
  formatWibDateIndonesian,
  getNowWibIso,
  getNowWibTimeLabel,
  getTodayWibDate,
  shiftYmdDate,
} from "@/lib/timezone";
import type {
  AttendanceStage,
  DashboardStatusData,
  TimelineStageItem,
  TimelineStageStatus,
  TodayOffDayStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_LABELS: Record<AttendanceStage, string> = {
  morning: "Pengingat Pagi + Kalender",
  afternoon: "Pengecekan Sore",
  urgent: "Peringatan Urgent + Eskalasi",
};

const STAGE_ORDER: AttendanceStage[] = ["morning", "afternoon", "urgent"];

export async function GET() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const now = new Date();
    const todayWib = getTodayWibDate(now);
    const tomorrowWib = shiftYmdDate(todayWib, 1);

    const [
      attendance,
      sentMap,
      pauseConfig,
      logs,
      recipient,
      customMessage,
      upcomingOffDays,
      schedule,
    ] = await Promise.all([
      getAttendanceStatus(todayWib),
      getAllStageSentAt(todayWib),
      getBotPauseConfig(),
      getRecentActivityLogs(15),
      getActiveRecipient(),
      getActiveCustomMessage(todayWib),
      getUpcomingOffDays(todayWib),
      getActiveSchedule(),
    ]);

    const todayOffEntry = upcomingOffDays.find((entry) => entry.date === todayWib);
    const todayOffDay: TodayOffDayStatus = todayOffEntry
      ? { isOff: true, ...(todayOffEntry.note ? { note: todayOffEntry.note } : {}) }
      : { isOff: false };

    const timeline: TimelineStageItem[] = STAGE_ORDER.map((stage) => {
      const stageCfg = schedule[stage];
      const sentAt = sentMap[stage];
      let status: TimelineStageStatus = "waiting";

      if (sentAt) {
        status = "sent";
      } else if (!stageCfg.enabled) {
        status = "disabled";
      } else if (attendance) {
        status = "cancelled";
      } else if (pauseConfig.paused) {
        status = "paused";
      } else if (todayOffDay.isOff) {
        status = "off_day";
      }

      return {
        stage,
        label: STAGE_LABELS[stage],
        scheduledTimeWib: formatHmTimeWibLabel(stageCfg.time),
        status,
        sentAt,
      };
    });

    const data: DashboardStatusData = {
      todayWib,
      tomorrowWib,
      todayFormatted: formatWibDateIndonesian(todayWib),
      nowWibIso: getNowWibIso(now),
      nowWibTime: getNowWibTimeLabel(now),
      partnerName: recipient.name,
      partnerEmail: recipient.email,
      recipient,
      customMessage,
      todayOffDay,
      upcomingOffDays,
      schedule,
      attendance,
      timeline,
      pauseConfig,
      logs,
    };

    return jsonOk("Status dashboard berhasil dimuat.", data);
  } catch (error) {
    return handleRouteError(error, "Gagal memuat status dashboard.");
  }
}
