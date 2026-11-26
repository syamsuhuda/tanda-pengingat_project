import { buildGoogleCalendarTemplateUrl } from "./ics";
import {
  DEFAULT_CATEGORY_BY_MODE,
  generateItineraryIntroMessage,
  normalizeItineraryMode,
} from "./itinerary-copy";
import {
  formatDurationIndonesian,
  formatWibDateIndonesian,
  formatWibDateShortIndonesian,
} from "./timezone";
import type {
  AttendanceStage,
  IcsBundleMode,
  ItineraryMessageTone,
  ItineraryRecipientMode,
  OtpPurpose,
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
  badgeText: string;
  heading: string;
  bannerBgFallback: string;
  bannerBgGradient: string;
  badgeBg: string;
  badgeColor: string;
  accentColor: string;
  bodyHtml: string;
  includeCalendarTip: boolean;
  senderName: string;
}): string {
  const calendarTipHtml = params.includeCalendarTip
    ? `<tr>
        <td style="padding:16px 24px 0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F5F3FF" style="background-color:#F5F3FF;border:1px solid #DDD6FE;border-radius:14px;">
            <tr>
              <td style="padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#4C1D95;">
                <strong>Tips Google Calendar:</strong> Kalau ini pertama kali kamu menerima undangan dari pengirim ini dan jadwal belum langsung muncul di kalender, klik tombol <strong>"I know the sender"</strong> di bagian atas email Gmail, atau tekan tombol <strong>Tambah Manual ke Google Calendar</strong> di atas ya!
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
<body style="margin:0;padding:0;background-color:#F4F2FA;color:#1E1B2E;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(params.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F4F2FA" style="background-color:#F4F2FA;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E5E1F2;border-radius:20px;overflow:hidden;">
          <tr>
            <td bgcolor="${params.bannerBgFallback}" style="background-color:${params.bannerBgFallback};background-image:${params.bannerBgGradient};padding:26px 24px 22px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${params.badgeBg};color:${params.badgeColor};font-size:12px;font-weight:700;margin-bottom:10px;">
                ${escapeHtml(params.badgeText)}
              </div>
              <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:1.3;color:#FFFFFF;font-weight:700;">
                ${escapeHtml(params.heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 24px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.68;color:#2D2942;">
              ${params.bodyHtml}
            </td>
          </tr>
          ${calendarTipHtml}
          <tr>
            <td style="padding:18px 24px 22px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6E6A85;border-top:1px solid #EFEBF8;">
              Dikirim hangat melalui ${escapeHtml(params.senderName)} (Acuan waktu: WIB / Asia/Jakarta).
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
  recipientName: string;
  senderName: string;
  confirmUrl: string;
  customMessage?: string | null;
  scheduledTimeWib?: string;
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
  const recipientName = params.recipientName.trim();
  const cleanCustomMessage = params.customMessage?.trim() || null;

  const defaultTimeByStage: Record<AttendanceStage | "manual", string> = {
    morning: "09:00 WIB",
    afternoon: "15:00 WIB",
    urgent: "20:30 WIB",
    manual: "",
  };
  const timeLabel = params.scheduledTimeWib?.trim() || defaultTimeByStage[params.stage];

  const stageCopy: Record<
    AttendanceStage | "manual",
    {
      badge: string;
      subject: string;
      heading: string;
      intro: string;
      bannerFallback: string;
      bannerGradient: string;
      badgeBg: string;
      badgeColor: string;
      accent: string;
    }
  > = {
    morning: {
      badge: `Pengingat Pagi (${timeLabel})`,
      subject: `Pagi, ${recipientName}! Yuk absen dulu biar hari ini tenang (${dateShort})`,
      heading: `Pagi, ${recipientName}!`,
      intro: `Semangat menjalani hari ini (${dateLong})! Jangan lupa absen dulu ya. Begitu selesai, klik tombol di bawah biar pengingat sore dan malam hari ini otomatis off.`,
      bannerFallback: "#E11D48",
      bannerGradient: "linear-gradient(135deg, #E11D48 0%, #F97316 100%)",
      badgeBg: "rgba(255,255,255,0.2)",
      badgeColor: "#FFFFFF",
      accent: "#E11D48",
    },
    afternoon: {
      badge: `Cek Sore (${timeLabel})`,
      subject: `Knock knock ${recipientName}! Sore nih, udah sempet absen belum? (${dateShort})`,
      heading: `Knock knock ${recipientName}! Sore nih, udah sempet absen belum?`,
      intro: `Sampai pukul ${timeLabel} untuk tanggal ${dateLong}, status absen kamu belum tercatat nih. Kalau sudah absen, tinggal tekan tombol di bawah supaya pengingat malam tidak ikut nyusul.`,
      bannerFallback: "#D97706",
      bannerGradient: "linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)",
      badgeBg: "rgba(255,255,255,0.22)",
      badgeColor: "#FFFFFF",
      accent: "#D97706",
    },
    urgent: {
      badge: `Pengingat Terakhir Hari Ini (${timeLabel})`,
      subject: `Hai ${recipientName}, cek absen sebentar yuk sebelum hari selesai (${dateShort})`,
      heading: `Pengingat terakhir hari ini ya, ${recipientName}`,
      intro: `Sudah pukul ${timeLabel} dan absen untuk ${dateLong} masih belum dikonfirmasi. Cek sebentar yuk mumpung belum kelewat hari, lalu tekan tombol di bawah kalau sudah beres!`,
      bannerFallback: "#BE123C",
      bannerGradient: "linear-gradient(135deg, #BE123C 0%, #9333EA 100%)",
      badgeBg: "rgba(255,255,255,0.2)",
      badgeColor: "#FFFFFF",
      accent: "#BE123C",
    },
    manual: {
      badge: "Pengingat Personal",
      subject: `Hai ${recipientName}, ada pengingat absen spesial buat kamu (${dateShort})`,
      heading: `Hai ${recipientName}, jangan lupa absen hari ini ya!`,
      intro: `Ini pengingat langsung untuk absen tanggal ${dateLong}. Kalau sudah absen, langsung tekan tombol di bawah ya!`,
      bannerFallback: "#E11D48",
      bannerGradient: "linear-gradient(135deg, #E11D48 0%, #EC4899 100%)",
      badgeBg: "rgba(255,255,255,0.2)",
      badgeColor: "#FFFFFF",
      accent: "#E11D48",
    },
  };

  const copy = stageCopy[params.stage];
  const customMessageHtml = cleanCustomMessage
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFBEB" style="margin:18px 0;background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:16px;">
        <tr>
          <td style="padding:16px 18px;font-size:14px;line-height:1.65;color:#78350F;">
            <div style="font-size:12px;font-weight:700;color:#B45309;margin-bottom:6px;">
              Catatan spesial buat ${escapeHtml(recipientName)}
            </div>
            <div style="font-size:15px;font-weight:500;color:#451A03;">
              &ldquo;${formatMultilineHtml(cleanCustomMessage)}&rdquo;
            </div>
          </td>
        </tr>
      </table>`
    : "";

  const googleCalendarUrl = params.calendarSlot
    ? buildGoogleCalendarTemplateUrl({
        title: params.calendarSlot.summary,
        dtStartUtc: params.calendarSlot.dtStartUtc,
        dtEndUtc: params.calendarSlot.dtEndUtc,
        description: [
          `Pengingat absen harian untuk ${recipientName} (${dateLong}).`,
          cleanCustomMessage ? `Catatan spesial: ${cleanCustomMessage}` : "",
          `Tautan konfirmasi: ${params.confirmUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
      })
    : null;

  const calendarBlockHtml =
    googleCalendarUrl && params.calendarSlot
      ? `<div style="margin-top:22px;padding-top:16px;border-top:1px dashed #E2DDF0;">
          <p style="margin:0 0 10px 0;font-size:13px;color:#5B5772;">
            Slot kalender: <strong style="color:#1E1B2E;">${escapeHtml(dateLong)}, ${escapeHtml(params.calendarSlot.startTime)} - ${escapeHtml(params.calendarSlot.endTime)} WIB</strong>
          </p>
          <a href="${escapeHtml(googleCalendarUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;border:1px solid #D4CEE8;border-radius:999px;color:#1E1B2E;text-decoration:none;font-size:13px;font-weight:600;background-color:#F8F7FC;">
            Tambah Manual ke Google Calendar
          </a>
        </div>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${escapeHtml(copy.intro)}</p>
    ${customMessageHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 18px 0;">
      <tr>
        <td bgcolor="${copy.accent}" style="border-radius:999px;background-color:${copy.accent};">
          <a href="${escapeHtml(params.confirmUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 28px;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;">
            Yeay, Aku Sudah Absen!
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#6E6A85;word-break:break-all;">
      Kalau tombolnya belum bisa diklik, buka tautan ini langsung di browser:<br />
      <a href="${escapeHtml(params.confirmUrl)}" style="color:${copy.accent};">${escapeHtml(params.confirmUrl)}</a>
    </p>
    ${calendarBlockHtml}
  `;

  const html = renderEmailShell({
    preheader: cleanCustomMessage
      ? `${copy.heading} ${cleanCustomMessage}`
      : `${copy.badge}: ${dateLong}`,
    badgeText: copy.badge,
    heading: copy.heading,
    bannerBgFallback: copy.bannerFallback,
    bannerBgGradient: copy.bannerGradient,
    badgeBg: copy.badgeBg,
    badgeColor: copy.badgeColor,
    accentColor: copy.accent,
    bodyHtml,
    includeCalendarTip: Boolean(googleCalendarUrl),
    senderName: params.senderName,
  });

  const textLines = [
    copy.badge,
    "",
    copy.heading,
    "",
    copy.intro,
    ...(cleanCustomMessage
      ? ["", `Catatan spesial buat ${recipientName}:`, `"${cleanCustomMessage}"`]
      : []),
    "",
    `Yeay, Aku Sudah Absen: ${params.confirmUrl}`,
    ...(googleCalendarUrl && params.calendarSlot
      ? [
          "",
          `Slot Kalender: ${dateLong}, ${params.calendarSlot.startTime} - ${params.calendarSlot.endTime} WIB`,
          `Tambah Manual ke Google Calendar: ${googleCalendarUrl}`,
          "",
          'Tips Google Calendar: Jika undangan kalender belum otomatis muncul di Gmail, klik "I know the sender" di bagian atas email.',
        ]
      : []),
    "",
    `Dikirim hangat melalui ${params.senderName} (WIB / Asia/Jakarta)`,
  ];

  return {
    subject: copy.subject,
    text: textLines.join("\n"),
    html,
  };
}

export function buildEscalationEmail(params: {
  dateWib: string;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  dashboardUrl: string;
  confirmUrl: string;
  scheduledTimeWib?: string;
}): EmailContent {
  const dateLong = formatWibDateIndonesian(params.dateWib);
  const dateShort = formatWibDateShortIndonesian(params.dateWib);
  const recipientName = params.recipientName.trim();
  const timeLabel = params.scheduledTimeWib?.trim() || "20:30 WIB";

  const subject = `[Eskalasi ${timeLabel}] Absen ${recipientName} hari ini belum dikonfirmasi (${dateShort})`;
  const heading = `Absen ${recipientName} hari ini belum dikonfirmasi`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0;">
      Hingga jadwal eskalasi <strong>${escapeHtml(timeLabel)}</strong> pada <strong>${escapeHtml(dateLong)}</strong>, sistem belum menerima konfirmasi absen dari <strong>${escapeHtml(recipientName)}</strong> (${escapeHtml(params.recipientEmail)}).
    </p>
    <p style="margin:0 0 20px 0;">
      Email pengingat terakhir sudah dikirim ke ${escapeHtml(recipientName)}. Kamu bisa langsung menghubunginya untuk memastikan absen tidak terlewat, atau cek status terbaru di dashboard.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
      <tr>
        <td bgcolor="#BE123C" style="border-radius:999px;background-color:#BE123C;">
          <a href="${escapeHtml(params.dashboardUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;">
            Buka Dashboard Pengingat
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#5B5772;">
      Tautan konfirmasi langsung: <a href="${escapeHtml(params.confirmUrl)}" style="color:#E11D48;">${escapeHtml(params.confirmUrl)}</a>
    </p>
  `;

  const html = renderEmailShell({
    preheader: `Eskalasi ${timeLabel}: Absen ${recipientName} hari ini belum dikonfirmasi (${dateShort})`,
    badgeText: `Notifikasi Eskalasi (${timeLabel})`,
    heading,
    bannerBgFallback: "#1E1B2E",
    bannerBgGradient: "linear-gradient(135deg, #1E1B2E 0%, #BE123C 100%)",
    badgeBg: "rgba(255,255,255,0.18)",
    badgeColor: "#FFFFFF",
    accentColor: "#BE123C",
    bodyHtml,
    includeCalendarTip: false,
    senderName: params.senderName,
  });

  const text = [
    `Notifikasi Eskalasi Absen (${timeLabel})`,
    "",
    heading,
    "",
    `Hingga ${timeLabel} (${dateLong}), belum ada konfirmasi absen dari ${recipientName} (${params.recipientEmail}).`,
    `Email pengingat terakhir telah dikirimkan ke ${recipientName}.`,
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
  recipientName?: string;
  categoryLabel?: string;
  messageTone?: ItineraryMessageTone;
  customIntroMessage?: string;
  sessions: ResolvedItinerarySession[];
  icsMode: IcsBundleMode;
  alarmMinutes: number;
}): EmailContent {
  const normalizedMode = normalizeItineraryMode(params.mode);
  const isDate = normalizedMode === "date";
  const badgeText =
    params.categoryLabel?.trim() || DEFAULT_CATEGORY_BY_MODE[normalizedMode];
  const countLabel =
    params.sessions.length === 1
      ? "1 sesi terjadwal"
      : `${params.sessions.length} sesi dalam rangkaian acara`;

  const introText =
    params.customIntroMessage?.trim() ||
    generateItineraryIntroMessage({
      mode: normalizedMode,
      tone: params.messageTone && params.messageTone !== "custom" ? params.messageTone : "natural",
      senderName: params.senderName,
      recipientName: params.recipientName,
      categoryLabel: badgeText,
      sessionCount: params.sessions.length,
    });

  const attachmentNote =
    params.sessions.length > 1 && params.icsMode === "separate"
      ? `Terlampir ${params.sessions.length} file kalender (.ics) terpisah untuk masing-masing sesi dengan pengingat ${params.alarmMinutes} menit sebelumnya.`
      : `Terlampir file kalender (.ics) dengan pengingat otomatis ${params.alarmMinutes} menit sebelum acara dimulai.`;

  const bannerFallback = isDate ? "#E11D48" : "#4F46E5";
  const bannerGradient = isDate
    ? "linear-gradient(135deg, #E11D48 0%, #F97316 100%)"
    : "linear-gradient(135deg, #4F46E5 0%, #0EA5E9 100%)";
  const accent = isDate ? "#E11D48" : "#4F46E5";

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
          ? `<div style="margin-top:8px;font-size:13px;color:#3F3A56;">
              <strong>Lokasi:</strong> ${escapeHtml(session.locationName ?? "Lihat titik peta")}
            </div>`
          : "";

      const descriptionRow = session.description
        ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background-color:#FFFFFF;border:1px solid #EAE6F5;font-size:13px;line-height:1.55;color:#2D2942;">
            ${formatMultilineHtml(session.description)}
          </div>`
        : "";

      const mapsButton = session.mapsUrl
        ? `<a href="${escapeHtml(session.mapsUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-right:8px;margin-bottom:6px;padding:9px 14px;border-radius:999px;background-color:${accent};color:#FFFFFF;text-decoration:none;font-size:12px;font-weight:700;">
            Buka Google Maps
          </a>`
        : "";

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F8F7FC" style="margin:0 0 14px 0;background-color:#F8F7FC;border:1px solid #E5E1F2;border-radius:16px;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-size:12px;font-weight:700;color:${accent};margin-bottom:4px;">
              Sesi ${index + 1} &middot; ${escapeHtml(durationLabel)}
            </div>
            <div style="font-size:18px;font-weight:700;color:#1E1B2E;margin-bottom:6px;">
              ${escapeHtml(session.title)}
            </div>
            <div style="font-size:13px;color:#3F3A56;">
              <strong>Waktu:</strong> ${escapeHtml(dateLabel)}, ${escapeHtml(timeRangeLabel)}
            </div>
            ${locationRow}
            ${descriptionRow}
            <div style="margin-top:14px;">
              ${mapsButton}
              <a href="${escapeHtml(gcalUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:6px;padding:8px 14px;border:1px solid #D4CEE8;border-radius:999px;background-color:#FFFFFF;color:#1E1B2E;text-decoration:none;font-size:12px;font-weight:600;">
                Simpan ke Kalender
              </a>
            </div>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 12px 0;">${formatMultilineHtml(introText)}</p>
    <p style="margin:0 0 18px 0;font-size:13px;color:#5B5772;">${escapeHtml(attachmentNote)}</p>
    ${sessionsHtml}
  `;

  const html = renderEmailShell({
    preheader: `${badgeText}: ${params.subject} (${countLabel})`,
    badgeText,
    heading: params.subject,
    bannerBgFallback: bannerFallback,
    bannerBgGradient: bannerGradient,
    badgeBg: "rgba(255,255,255,0.2)",
    badgeColor: "#FFFFFF",
    accentColor: accent,
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
      `Simpan ke Kalender: ${gcalUrl}`,
    ].join("\n");
  });

  const text = [
    `[${badgeText}] ${params.subject}`,
    `Dari: ${params.senderName}`,
    "",
    introText,
    "",
    attachmentNote,
    "",
    ...textSessions.flatMap((block) => [block, ""]),
    'Tips Google Calendar: Jika undangan belum otomatis muncul di kalender, klik "I know the sender" di Gmail atau gunakan tautan Simpan ke Kalender di atas.',
  ].join("\n");

  return {
    subject: params.subject,
    text,
    html,
  };
}

export function buildPinResetOtpEmail(params: {
  purpose?: OtpPurpose;
  otp: string;
  requestedAtWibLabel: string;
  senderName: string;
}): EmailContent {
  const isChangePin = params.purpose === "change_pin";
  const safeOtp = escapeHtml(params.otp);
  const safeTime = escapeHtml(params.requestedAtWibLabel);
  const subject = isChangePin
    ? `[Keamanan] Kode OTP Ubah PIN Dashboard (${params.otp})`
    : `[Keamanan] Kode Pemulihan PIN Dashboard (${params.otp})`;
  const heading = isChangePin ? "Konfirmasi Ubah PIN Dashboard" : "Reset PIN Akses Dashboard";
  const actionPhrase = isChangePin
    ? "mengubah PIN akses dashboard"
    : "mereset PIN akses dashboard";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
      Kami menerima permintaan untuk ${actionPhrase} pada <strong>${safeTime}</strong>.
    </p>
    <div style="margin:0 0 18px 0;padding:20px;border-radius:14px;background-color:#F8FAFC;border:1px dashed #CBD5E1;text-align:center;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
        Kode Verifikasi 6 Digit
      </p>
      <p style="margin:0;font-family:'SF Mono',Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:0.22em;color:#0F172A;">
        ${safeOtp}
      </p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#64748B;">
        Berlaku selama <strong>10 menit</strong> (hanya untuk 1 kali penggunaan)
      </p>
    </div>
    <div style="padding:14px 16px;border-radius:12px;background-color:#FFF1F2;border:1px solid #FECDD3;">
      <p style="margin:0;font-size:13px;line-height:1.55;color:#9F1239;">
        <strong>Peringatan Keamanan:</strong> Jika bukan kamu yang meminta kode OTP ini, abaikan email ini. PIN saat ini tetap aman dan tidak berubah.
      </p>
    </div>
  `;

  const html = renderEmailShell({
    preheader: `${heading}: ${params.otp} (berlaku 10 menit).`,
    badgeText: "KEAMANAN AKUN",
    heading,
    bannerBgFallback: "#1E293B",
    bannerBgGradient: "linear-gradient(135deg, #1E293B 0%, #4F46E5 100%)",
    badgeBg: "rgba(255,255,255,0.16)",
    badgeColor: "#FFFFFF",
    accentColor: "#4F46E5",
    bodyHtml,
    includeCalendarTip: false,
    senderName: params.senderName,
  });

  const text = [
    heading,
    `Waktu permintaan: ${params.requestedAtWibLabel}`,
    "",
    `Kode Verifikasi 6 Digit: ${params.otp}`,
    "Kode berlaku selama 10 menit dan hanya dapat dipakai 1 kali.",
    "",
    "Jika bukan kamu yang meminta kode OTP ini, abaikan email ini. PIN saat ini tetap aman.",
  ].join("\n");

  return { subject, text, html };
}

export function buildPinResetSuccessEmail(params: {
  purpose?: OtpPurpose;
  resetAtWibLabel: string;
  senderName: string;
}): EmailContent {
  const isChangePin = params.purpose === "change_pin";
  const safeTime = escapeHtml(params.resetAtWibLabel);
  const subject = isChangePin
    ? "[Keamanan] PIN Dashboard Berhasil Diubah"
    : "[Keamanan] PIN Dashboard Berhasil Di-Reset";
  const actionDesc = isChangePin ? "diubah menjadi PIN 6 digit baru" : "di-reset menjadi PIN 6 digit baru";

  const bodyHtml = `
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155;">
      PIN akses dashboard baru saja berhasil ${actionDesc} pada <strong>${safeTime}</strong>.
    </p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#475569;">
      Demi keamanan, seluruh sesi login lama di perangkat lain telah otomatis dikeluarkan.
    </p>
    <div style="padding:14px 16px;border-radius:12px;background-color:#FFFBEB;border:1px solid #FDE68A;">
      <p style="margin:0;font-size:13px;line-height:1.55;color:#92400E;">
        Jika kamu tidak merasa melakukan perubahan ini, segera periksa keamanan akun email dan lakukan reset PIN ulang.
      </p>
    </div>
  `;

  const html = renderEmailShell({
    preheader: `PIN dashboard berhasil diperbarui pada ${params.resetAtWibLabel}.`,
    badgeText: "NOTIFIKASI KEAMANAN",
    heading: "PIN Dashboard Berhasil Diperbarui",
    bannerBgFallback: "#065F46",
    bannerBgGradient: "linear-gradient(135deg, #065F46 0%, #059669 100%)",
    badgeBg: "rgba(255,255,255,0.18)",
    badgeColor: "#FFFFFF",
    accentColor: "#059669",
    bodyHtml,
    includeCalendarTip: false,
    senderName: params.senderName,
  });

  const text = [
    "PIN Dashboard Berhasil Diperbarui",
    `Waktu: ${params.resetAtWibLabel}`,
    "",
    `PIN akses dashboard baru saja berhasil ${actionDesc} dan seluruh sesi lama di perangkat lain telah dikeluarkan.`,
    "Jika kamu tidak merasa melakukan perubahan ini, segera lakukan reset PIN ulang.",
  ].join("\n");

  return { subject, text, html };
}
