import { buildGoogleCalendarTemplateUrl } from "./ics";
import {
  formatDurationIndonesian,
  formatWibDateIndonesian,
  formatWibDateShortIndonesian,
} from "./timezone";
import type {
  AttendanceStage,
  IcsBundleMode,
  ItineraryRecipientMode,
  ResolvedItinerarySession,
} from "./types";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMultilineHtml(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
}

function renderEmailShell(params: {
  preheader: string;
  label: string;
  heading: string;
  accentColor: string;
  bodyHtml: string;
  includeCalendarTip: boolean;
  senderName: string;
}): string {
  const calendarTipHtml = params.includeCalendarTip
    ? `<tr>
        <td style="padding:16px 24px 0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4EFE6;border:1px solid #E2DDD5;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#57534E;">
                <strong style="color:#1C1917;">Catatan Google Calendar:</strong> Jika ini pertama kali Anda menerima undangan dari pengirim ini dan jadwal belum otomatis muncul di kalender, klik tombol <strong>"I know the sender"</strong> (Saya mengenal pengirim) di bagian atas email Gmail, atau gunakan tombol <strong>Tambah Manual ke Google Calendar</strong> di atas.
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF8F4;color:#1C1917;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(params.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF8F4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E2DDD5;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="height:4px;background-color:${params.accentColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:24px 24px 12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="font-size:12px;font-weight:600;color:${params.accentColor};margin-bottom:8px;">
                ${escapeHtml(params.label)}
              </div>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1C1917;font-weight:600;">
                ${escapeHtml(params.heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#292524;">
              ${params.bodyHtml}
            </td>
          </tr>
          ${calendarTipHtml}
          <tr>
            <td style="padding:20px 24px 24px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#78716C;border-top:1px solid #F0ECE4;">
              Dikirim melalui ${escapeHtml(params.senderName)} (Zona waktu acuan: WIB / Asia/Jakarta).
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAttendanceReminderEmail(params: {
  stage: AttendanceStage | "manual";
  dateWib: string;
  partnerName: string;
  senderName: string;
  confirmUrl: string;
  note?: string;
  calendarSlot?: {
    startTime: string;
    endTime: string;
    dtStartUtc: string;
    dtEndUtc: string;
    summary: string;
  };
}): EmailContent {
  const dateLong = formatWibDateIndonesian(params.dateWib);
  const dateShort = formatWibDateShortIndonesian(params.dateWib);

  const stageCopy: Record<
    AttendanceStage | "manual",
    { label: string; subject: string; heading: string; intro: string; accent: string }
  > = {
    morning: {
      label: "Pengingat Absen Pagi (09.00 WIB)",
      subject: `[Absen Pagi] Pengingat Absen, ${dateShort}`,
      heading: `Selamat pagi, ${params.partnerName}`,
      intro: `Pengingat rutin untuk melakukan absen hari ini (${dateLong}). Jika sudah absen, tekan tombol konfirmasi di bawah agar pengingat sore dan malam hari ini otomatis dibatalkan.`,
      accent: "#B4431D",
    },
    afternoon: {
      label: "Pengecekan Absen Sore (15.00 WIB)",
      subject: `[Cek Sore] Konfirmasi Absen Hari Ini, ${dateShort}`,
      heading: `Halo ${params.partnerName}, sudah absen hari ini?`,
      intro: `Sampai pukul 15.00 WIB, status absen untuk ${dateLong} belum tercatat terkonfirmasi. Jika sudah absen, tekan tombol di bawah supaya peringatan malam pukul 20.30 WIB tidak perlu terkirim.`,
      accent: "#B45309",
    },
    urgent: {
      label: "Peringatan Urgent (20.30 WIB)",
      subject: `[URGENT] Belum Konfirmasi Absen, ${dateShort}`,
      heading: `Segera cek absen hari ini, ${params.partnerName}`,
      intro: `Sudah pukul 20.30 WIB dan konfirmasi absen untuk ${dateLong} belum masuk. Mohon segera pastikan absen sudah dilakukan lalu tekan tombol konfirmasi di bawah.`,
      accent: "#B91C1C",
    },
    manual: {
      label: "Pengingat Absen Manual",
      subject: `[Pengingat Absen] ${dateShort}`,
      heading: `Halo ${params.partnerName}, pengingat absen hari ini`,
      intro: `Ini adalah pengingat manual untuk absen tanggal ${dateLong}. Setelah absen selesai, klik tombol di bawah untuk mencatat konfirmasi.`,
      accent: "#B4431D",
    },
  };

  const copy = stageCopy[params.stage];
  const noteBlockHtml = params.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#FAF8F4;border-left:3px solid ${copy.accent};border-radius:4px;">
        <tr>
          <td style="padding:12px 16px;font-size:14px;color:#292524;">
            <div style="font-size:12px;font-weight:600;color:#57534E;margin-bottom:4px;">Catatan tambahan:</div>
            ${formatMultilineHtml(params.note)}
          </td>
        </tr>
      </table>`
    : "";

  const googleCalendarUrl = params.calendarSlot
    ? buildGoogleCalendarTemplateUrl({
        title: params.calendarSlot.summary,
        dtStartUtc: params.calendarSlot.dtStartUtc,
        dtEndUtc: params.calendarSlot.dtEndUtc,
        description: `Pengingat absen harian untuk ${dateLong}. Tautan konfirmasi: ${params.confirmUrl}`,
      })
    : null;

  const calendarBlockHtml =
    googleCalendarUrl && params.calendarSlot
      ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #EFECE6;">
          <p style="margin:0 0 10px 0;font-size:13px;color:#57534E;">
            Slot kalender: <strong style="color:#1C1917;">${escapeHtml(dateLong)}, ${escapeHtml(params.calendarSlot.startTime)} - ${escapeHtml(params.calendarSlot.endTime)} WIB</strong>
          </p>
          <a href="${escapeHtml(googleCalendarUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border:1px solid #C8C1B6;border-radius:8px;color:#1C1917;text-decoration:none;font-size:13px;font-weight:600;background-color:#FAF8F4;">
            Tambah Manual ke Google Calendar
          </a>
        </div>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${escapeHtml(copy.intro)}</p>
    ${noteBlockHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 16px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${copy.accent};">
          <a href="${escapeHtml(params.confirmUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;">
            Konfirmasi: Saya Sudah Absen
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#78716C;word-break:break-all;">
      Jika tombol tidak dapat diklik, buka tautan berikut di browser:<br />
      <a href="${escapeHtml(params.confirmUrl)}" style="color:${copy.accent};">${escapeHtml(params.confirmUrl)}</a>
    </p>
    ${calendarBlockHtml}
  `;

  const html = renderEmailShell({
    preheader: `${copy.label}: ${dateLong}`,
    label: copy.label,
    heading: copy.heading,
    accentColor: copy.accent,
    bodyHtml,
    includeCalendarTip: Boolean(googleCalendarUrl),
    senderName: params.senderName,
  });

  const textLines = [
    copy.label,
    "",
    copy.heading,
    "",
    copy.intro,
    ...(params.note ? ["", `Catatan tambahan: ${params.note}`] : []),
    "",
    `Konfirmasi Saya Sudah Absen: ${params.confirmUrl}`,
    ...(googleCalendarUrl && params.calendarSlot
      ? [
          "",
          `Slot Kalender: ${dateLong}, ${params.calendarSlot.startTime} - ${params.calendarSlot.endTime} WIB`,
          `Tambah Manual ke Google Calendar: ${googleCalendarUrl}`,
          "",
          'Catatan: Jika undangan kalender belum otomatis muncul di Gmail, klik "I know the sender" di bagian atas email.',
        ]
      : []),
    "",
    `Dikirim melalui ${params.senderName} (WIB / Asia/Jakarta)`,
  ];

  return {
    subject: copy.subject,
    text: textLines.join("\n"),
    html,
  };
}

export function buildEscalationEmail(params: {
  dateWib: string;
  partnerName: string;
  partnerEmail: string;
  senderName: string;
  dashboardUrl: string;
  confirmUrl: string;
}): EmailContent {
  const dateLong = formatWibDateIndonesian(params.dateWib);
  const dateShort = formatWibDateShortIndonesian(params.dateWib);

  const subject = `[Eskalasi 20.30 WIB] ${params.partnerName} belum konfirmasi absen (${dateShort})`;
  const heading = `${params.partnerName} belum konfirmasi absen hari ini`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0;">
      Hingga jadwal eskalasi <strong>20.30 WIB</strong> pada <strong>${escapeHtml(dateLong)}</strong>, sistem belum menerima konfirmasi absen dari <strong>${escapeHtml(params.partnerName)}</strong> (${escapeHtml(params.partnerEmail)}).
    </p>
    <p style="margin:0 0 20px 0;">
      Email peringatan urgent sudah dikirim ke ${escapeHtml(params.partnerName)}. Anda dapat menghubungi langsung untuk memastikan absen hari ini tidak terlewat, atau memeriksa status di dashboard.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
      <tr>
        <td style="border-radius:8px;background-color:#B91C1C;">
          <a href="${escapeHtml(params.dashboardUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;">
            Buka Dashboard Pengingat
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#57534E;">
      Tautan konfirmasi langsung: <a href="${escapeHtml(params.confirmUrl)}" style="color:#B4431D;">${escapeHtml(params.confirmUrl)}</a>
    </p>
  `;

  const html = renderEmailShell({
    preheader: `Eskalasi 20.30 WIB: ${params.partnerName} belum konfirmasi absen ${dateShort}`,
    label: "Notifikasi Eskalasi Absen (20.30 WIB)",
    heading,
    accentColor: "#B91C1C",
    bodyHtml,
    includeCalendarTip: false,
    senderName: params.senderName,
  });

  const text = [
    "Notifikasi Eskalasi Absen (20.30 WIB)",
    "",
    heading,
    "",
    `Hingga 20.30 WIB (${dateLong}), belum ada konfirmasi absen dari ${params.partnerName} (${params.partnerEmail}).`,
    `Email peringatan urgent telah dikirimkan ke ${params.partnerName}.`,
    "",
    `Buka Dashboard: ${params.dashboardUrl}`,
    `Tautan Konfirmasi: ${params.confirmUrl}`,
  ].join("\n");

  return { subject, text, html };
}

export function buildItineraryEmail(params: {
  mode: ItineraryRecipientMode;
  subject: string;
  senderName: string;
  sessions: ResolvedItinerarySession[];
  icsMode: IcsBundleMode;
  alarmMinutes: number;
}): EmailContent {
  const modeLabel = params.mode === "date" ? "Date Itinerary" : "Undangan Acara & Hangout";
  const countLabel =
    params.sessions.length === 1
      ? "1 sesi terjadwal"
      : `${params.sessions.length} sesi dalam rangkaian itinerary`;

  const attachmentNote =
    params.sessions.length > 1 && params.icsMode === "separate"
      ? `Terlampir ${params.sessions.length} file kalender (.ics) terpisah untuk setiap sesi, serta pengingat otomatis ${params.alarmMinutes} menit sebelum acara.`
      : `Terlampir file undangan kalender (.ics) dengan pengingat otomatis ${params.alarmMinutes} menit sebelum acara.`;

  const sessionsHtml = params.sessions
    .map((session, index) => {
      const gcalUrl = buildGoogleCalendarTemplateUrl({
        title: session.title,
        dtStartUtc: session.dtStartUtc,
        dtEndUtc: session.dtEndUtc,
        description: session.description,
        locationName: session.locationName,
        mapsUrl: session.mapsUrl,
      });

      const dateLabel = formatWibDateIndonesian(session.date);
      const timeRangeLabel = session.crossesMidnight
        ? `${session.startTime} - ${session.endTime} WIB (+1 hari, selesai ${formatWibDateShortIndonesian(session.endDateWib)})`
        : `${session.startTime} - ${session.endTime} WIB`;
      const durationLabel = formatDurationIndonesian(session.durationMinutes);

      const locationRow =
        session.locationName || session.mapsUrl
          ? `<div style="margin-top:8px;font-size:13px;color:#44403C;">
              <strong>Lokasi:</strong> ${escapeHtml(session.locationName ?? "Lihat peta")}
              ${
                session.mapsUrl
                  ? ` &middot; <a href="${escapeHtml(session.mapsUrl)}" target="_blank" rel="noopener noreferrer" style="color:#B4431D;font-weight:600;text-decoration:underline;">Buka Google Maps</a>`
                  : ""
              }
            </div>`
          : "";

      const descriptionRow = session.description
        ? `<div style="margin-top:8px;font-size:14px;line-height:1.55;color:#292524;">
            ${formatMultilineHtml(session.description)}
          </div>`
        : "";

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;background-color:#FAF8F4;border:1px solid #E2DDD5;border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-size:12px;font-weight:600;color:#B4431D;margin-bottom:4px;">
              Sesi ${index + 1} &middot; ${escapeHtml(durationLabel)}
            </div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#1C1917;margin-bottom:6px;">
              ${escapeHtml(session.title)}
            </div>
            <div style="font-size:13px;color:#44403C;">
              <strong>Waktu:</strong> ${escapeHtml(dateLabel)}, ${escapeHtml(timeRangeLabel)}
            </div>
            ${locationRow}
            ${descriptionRow}
            <div style="margin-top:12px;">
              <a href="${escapeHtml(gcalUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:8px 14px;border:1px solid #C8C1B6;border-radius:6px;background-color:#FFFFFF;color:#1C1917;text-decoration:none;font-size:12px;font-weight:600;">
                Tambah Manual ke Google Calendar
              </a>
            </div>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">
      Berikut detail jadwal yang dibagikan oleh <strong>${escapeHtml(params.senderName)}</strong> (${escapeHtml(countLabel)}). ${escapeHtml(attachmentNote)}
    </p>
    ${sessionsHtml}
  `;

  const html = renderEmailShell({
    preheader: `${modeLabel}: ${params.subject} (${countLabel})`,
    label: modeLabel,
    heading: params.subject,
    accentColor: "#B4431D",
    bodyHtml,
    includeCalendarTip: true,
    senderName: params.senderName,
  });

  const textSessions = params.sessions.map((session, index) => {
    const gcalUrl = buildGoogleCalendarTemplateUrl({
      title: session.title,
      dtStartUtc: session.dtStartUtc,
      dtEndUtc: session.dtEndUtc,
      description: session.description,
      locationName: session.locationName,
      mapsUrl: session.mapsUrl,
    });
    const dateLabel = formatWibDateIndonesian(session.date);
    const timeRange = session.crossesMidnight
      ? `${session.startTime} - ${session.endTime} WIB (+1 hari, selesai ${formatWibDateShortIndonesian(session.endDateWib)})`
      : `${session.startTime} - ${session.endTime} WIB`;

    return [
      `Sesi ${index + 1}: ${session.title}`,
      `Waktu: ${dateLabel}, ${timeRange} (${formatDurationIndonesian(session.durationMinutes)})`,
      ...(session.locationName ? [`Lokasi: ${session.locationName}`] : []),
      ...(session.mapsUrl ? [`Google Maps: ${session.mapsUrl}`] : []),
      ...(session.description ? [`Catatan: ${session.description}`] : []),
      `Tambah Manual ke Google Calendar: ${gcalUrl}`,
    ].join("\n");
  });

  const text = [
    `${modeLabel}: ${params.subject}`,
    `Pengirim: ${params.senderName} (${countLabel})`,
    attachmentNote,
    "",
    ...textSessions.flatMap((block) => [block, ""]),
    'Catatan Google Calendar: Jika undangan belum otomatis muncul di kalender, klik "I know the sender" di Gmail atau gunakan tautan Tambah Manual di atas.',
  ].join("\n");

  return {
    subject: params.subject,
    text,
    html,
  };
}
