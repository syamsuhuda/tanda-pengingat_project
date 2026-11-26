import { NextResponse } from "next/server";
import {
  handleRouteError,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import {
  getDashboardSnapshotViaPipeline,
  getDashboardVersion,
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
  ApiResponse,
  AttendanceStage,
  DashboardStatusData,
  DashboardStatusResponseData,
  DashboardUnchangedData,
  TimelineStageItem,
  TimelineStageStatus,
  TodayOffDayStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

const STAGE_LABELS: Record<AttendanceStage, string> = {
  morning: "Pengingat Pagi + Kalender",
  afternoon: "Pengecekan Sore",
  urgent: "Peringatan Urgent + Eskalasi",
};

const STAGE_ORDER: AttendanceStage[] = ["morning", "afternoon", "urgent"];

export async function GET(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const searchParams = new URL(request.url).searchParams;
    const sinceVersion = searchParams.get("sinceVersion")?.trim() ?? "";
    const clientDate = searchParams.get("clientDate")?.trim() ?? "";

    const now = new Date();
    const todayWib = getTodayWibDate(now);
    const serverTimeWib = getNowWibIso(now);

    if (sinceVersion && clientDate === todayWib) {
      const currentVersion = await getDashboardVersion();
      if (currentVersion === sinceVersion) {
        const unchangedData: DashboardUnchangedData = {
          unchanged: true,
          version: currentVersion,
          serverTimeWib,
          todayWib,
        };
        const payload: ApiResponse<DashboardStatusResponseData> = {
          ok: true,
          message: "Belum ada perubahan.",
          data: unchangedData,
        };
        return NextResponse.json(payload, { status: 200, headers: NO_CACHE_HEADERS });
      }
    }

    const tomorrowWib = shiftYmdDate(todayWib, 1);
    const snapshot = await getDashboardSnapshotViaPipeline(todayWib);

    const todayOffEntry = snapshot.upcomingOffDays.find((entry) => entry.date === todayWib);
    const todayOffDay: TodayOffDayStatus = todayOffEntry
      ? { isOff: true, ...(todayOffEntry.note ? { note: todayOffEntry.note } : {}) }
      : { isOff: false };

    const timeline: TimelineStageItem[] = STAGE_ORDER.map((stage) => {
      const stageCfg = snapshot.schedule[stage];
      const sentAt = snapshot.sentMap[stage];
      let status: TimelineStageStatus = "waiting";

      if (sentAt) {
        status = "sent";
      } else if (!stageCfg.enabled) {
        status = "disabled";
      } else if (snapshot.attendance) {
        status = "cancelled";
      } else if (snapshot.pauseConfig.paused) {
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
      unchanged: false,
      version: snapshot.version,
      serverTimeWib,
      todayWib,
      tomorrowWib,
      todayFormatted: formatWibDateIndonesian(todayWib),
      nowWibIso: serverTimeWib,
      nowWibTime: getNowWibTimeLabel(now),
      partnerName: snapshot.recipient.name,
      partnerEmail: snapshot.recipient.email,
      senderName: snapshot.senderName,
      recipient: snapshot.recipient,
      customMessage: snapshot.customMessage,
      todayOffDay,
      upcomingOffDays: snapshot.upcomingOffDays,
      schedule: snapshot.schedule,
      attendance: snapshot.attendance,
      timeline,
      pauseConfig: snapshot.pauseConfig,
      logs: snapshot.logs,
    };

    const payload: ApiResponse<DashboardStatusResponseData> = {
      ok: true,
      message: "Status dashboard berhasil dimuat.",
      data,
    };

    return NextResponse.json(payload, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (error) {
    return handleRouteError(error, "Gagal memuat status dashboard.");
  }
}
