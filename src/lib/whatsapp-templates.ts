import { formatWibDateIndonesian } from "./timezone";
import type {
  AttendanceStage,
  ItineraryRecipientMode,
  ItinerarySessionInput,
} from "./types";

const STAGE_HEADING: Record<AttendanceStage | "manual", { title: string; lead: string }> = {
  morning: {
    title: "Pengingat Absen Pagi",
    lead: "Jangan lupa lakukan absen hari ini sebelum beraktivitas ya.",
  },
  afternoon: {
    title: "Pengecekan Absen Siang/Sore",
    lead: "Sekadar mengingatkan kembali, absen hari ini belum tercatat selesai.",
  },
  urgent: {
    title: "Peringatan Urgent Absen",
    lead: "Absen hari ini masih belum terkonfirmasi. Segera selesaikan sekarang ya.",
  },
  manual: {
    title: "Pengingat Absen",
    lead: "Pengingat langsung untuk segera menyelesaikan absen hari ini.",
  },
};

export function buildAttendanceReminderWhatsApp(params: {
  stage: AttendanceStage | "manual";
  dateWib: string;
  recipientName: string;
  senderName: string;
  confirmUrl: string;
  customMessage?: string | null;
  scheduledTimeWib?: string;
}): string {
  const stageMeta = STAGE_HEADING[params.stage];
  const dateLabel = formatWibDateIndonesian(params.dateWib);
  const cleanNote = params.customMessage?.trim();

  const lines: string[] = [
    `*${stageMeta.title}*`,
    `Halo *${params.recipientName}*,`,
    "",
    stageMeta.lead,
    "",
    `Tanggal: *${dateLabel}*`,
  ];

  if (params.scheduledTimeWib) {
    lines.push(`Jadwal: ${params.scheduledTimeWib}`);
  }

  if (cleanNote) {
    lines.push("", `*Catatan dari ${params.senderName}:*`, cleanNote);
  }

  lines.push(
    "",
    "Konfirmasi absen di sini:",
    params.confirmUrl,
    "",
    `_Dikirim oleh ${params.senderName}_`,
  );

  return lines.join("\n");
}

export function buildItineraryWhatsApp(params: {
  mode: ItineraryRecipientMode;
  subject: string;
  senderName: string;
  recipientName?: string;
  categoryLabel?: string;
  customIntroMessage?: string;
  sessions: ItinerarySessionInput[];
}): string {
  const greetingName = params.recipientName?.trim() || "teman-teman";
  const categoryPrefix = params.categoryLabel?.trim() ? `[${params.categoryLabel.trim()}] ` : "";
  const cleanIntro = params.customIntroMessage?.trim();

  const lines: string[] = [
    `*${categoryPrefix}${params.subject.trim()}*`,
    `Halo *${greetingName}*, berikut detail jadwal dari *${params.senderName}*:`,
  ];

  if (cleanIntro) {
    lines.push("", cleanIntro);
  }

  params.sessions.forEach((session, idx) => {
    const num = params.sessions.length > 1 ? `${idx + 1}. ` : "";
    const dateLabel = formatWibDateIndonesian(session.date);
    lines.push("", `*${num}${session.title}*`);
    lines.push(`Tanggal: ${dateLabel}`);
    lines.push(`Waktu: ${session.startTime} - ${session.endTime} WIB`);
    if (session.locationName?.trim()) {
      lines.push(`Lokasi: ${session.locationName.trim()}`);
    }
    if (session.mapsUrl?.trim()) {
      lines.push(`Maps: ${session.mapsUrl.trim()}`);
    }
    if (session.description?.trim()) {
      lines.push(`Catatan: ${session.description.trim()}`);
    }
  });

  lines.push("", `_Dikirim oleh ${params.senderName}_`);
  return lines.join("\n");
}
