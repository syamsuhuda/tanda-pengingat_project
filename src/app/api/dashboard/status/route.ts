import {
  handleRouteError,
  jsonOk,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { getEnv } from "@/lib/env";
import {
  getAllStageSentAt,
  getAttendanceStatus,
  getBotPauseConfig,
  getRecentActivityLogs,
} from "@/lib/store";
import {
  formatWibDateIndonesian,
  getNowWibIso,
  getNowWibTimeLabel,
  getTodayWibDate,
} from "@/lib/timezone";
import type {
  AttendanceStage,
  DashboardStatusData,
  TimelineStageItem,
  TimelineStageStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_DEFINITIONS: Array<{
  stage: AttendanceStage;
  label: string;
  scheduledTimeWib: string;
}> = [
  { stage: "morning", label: "Pengingat Pagi + Kalender", scheduledTimeWib: "09.00 WIB" },
  { stage: "afternoon", label: "Pengecekan Sore", scheduledTimeWib: "15.00 WIB" },
  { stage: "urgent", label: "Peringatan Urgent + Eskalasi", scheduledTimeWib: "20.30 WIB" },
];

export async function GET() {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const env = getEnv();
    const now = new Date();
    const todayWib = getTodayWibDate(now);

    const [attendance, sentMap, pauseConfig, logs] = await Promise.all([
      getAttendanceStatus(todayWib),
      getAllStageSentAt(todayWib),
      getBotPauseConfig(),
      getRecentActivityLogs(15),
    ]);

    const timeline: TimelineStageItem[] = STAGE_DEFINITIONS.map((def) => {
      const sentAt = sentMap[def.stage];
      let status: TimelineStageStatus = "waiting";

      if (sentAt) {
        status = "sent";
      } else if (attendance) {
        status = "cancelled";
      } else if (pauseConfig.paused) {
        status = "paused";
      }

      return {
        stage: def.stage,
        label: def.label,
        scheduledTimeWib: def.scheduledTimeWib,
        status,
        sentAt,
      };
    });

    const data: DashboardStatusData = {
      todayWib,
      todayFormatted: formatWibDateIndonesian(todayWib),
      nowWibIso: getNowWibIso(now),
      nowWibTime: getNowWibTimeLabel(now),
      partnerName: env.PARTNER_NAME,
      partnerEmail: env.PARTNER_EMAIL,
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
