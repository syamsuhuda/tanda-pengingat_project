import type {
  ItineraryMessageTone,
  ItineraryRecipientMode,
  NormalizedItineraryMode,
} from "./types";

export const EVENT_CATEGORY_PRESETS = [
  "Hangout Plan",
  "Event Plan",
  "Trip & Liburan",
  "Meeting & Diskusi",
  "Olahraga & Aktivitas",
  "Acara Keluarga",
  "Komunitas & Gathering",
] as const;

export const DATE_CATEGORY_PRESETS = [
  "Date Plan",
  "Weekend Date",
  "Dinner Date",
  "Quality Time",
  "Mini Trip Berdua",
  "Special Day",
] as const;

export const DEFAULT_CATEGORY_BY_MODE: Record<NormalizedItineraryMode, string> = {
  date: "Date Plan",
  event: "Event Plan",
};

export function normalizeItineraryMode(mode: ItineraryRecipientMode): NormalizedItineraryMode {
  return mode === "date" ? "date" : "event";
}

export function generateItineraryIntroMessage(params: {
  mode: ItineraryRecipientMode;
  tone: ItineraryMessageTone;
  senderName: string;
  recipientName?: string;
  categoryLabel: string;
  sessionCount: number;
}): string {
  const mode = normalizeItineraryMode(params.mode);
  const sender = params.senderName.trim() || "Pengirim";
  const partner = params.recipientName?.trim() || "kamu";
  const category = params.categoryLabel.trim() || DEFAULT_CATEGORY_BY_MODE[mode];
  const isMulti = params.sessionCount > 1;
  const sessionPhrase = isMulti
    ? `rangkaian ${params.sessionCount} sesi acara`
    : "jadwal acara";

  if (params.tone === "custom") {
    return "";
  }

  if (mode === "date") {
    switch (params.tone) {
      case "formal":
        return `Halo ${partner}, bersama ini ${sender} mengirimkan rincian ${sessionPhrase} untuk ${category}. Mohon luangkan waktu untuk meninjau jadwal di bawah ini dan menyimpannya ke kalender.`;
      case "natural":
        return `Hai ${partner}, ini ${sessionPhrase} (${category}) yang sudah ${sender} siapkan untuk kita. Cek detail waktu dan lokasinya di bawah, lalu simpan ke kalender ya.`;
      case "casual":
        return `Hai ${partner}! ${sender} udah nyiapin ${category} seru buat kita nih (${isMulti ? `${params.sessionCount} agenda` : "1 agenda"}). Cek detailnya di bawah ya, jangan lupa simpan ke kalender biar nggak kelewat!`;
    }
  }

  switch (params.tone) {
    case "formal":
      return `Yth. Bapak/Ibu dan rekan sekalian, berikut ${sender} sampaikan rincian ${sessionPhrase} untuk kegiatan ${category}. Mohon kesediaannya untuk memeriksa jadwal di bawah ini dan menambahkannya ke kalender.`;
    case "natural":
      return `Halo semuanya, ${sender} membagikan ${sessionPhrase} untuk ${category}. Silakan cek detail waktu serta lokasinya di bawah ini dan simpan ke Google Calendar masing-masing.`;
    case "casual":
      return `Halo semuanya! ${sender} baru saja nyiapin ${category} (${isMulti ? `${params.sessionCount} sesi` : "1 sesi"}). Yuk cek detail waktu dan lokasinya di bawah, lalu simpan ke kalender biar kompak!`;
  }
}
