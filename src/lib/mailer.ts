import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { getEnv } from "./env";
import {
  buildAttendanceReminderEmail,
  buildEscalationEmail,
  buildItineraryEmail,
  buildPinResetOtpEmail,
  buildPinResetSuccessEmail,
} from "./email-templates";
import {
  buildAttendanceCalendarSlot,
  generateIcsCalendar,
  slugifyIcsFilename,
} from "./ics";
import { sanitizeEmailHeaderValue, sanitizeSenderDisplayName } from "./security";
import { getManualAttendanceSlot, resolveWibSessionUtcRange } from "./timezone";
import type {
  AlarmMinutes,
  AttendanceStage,
  IcsBundleMode,
  ItineraryMessageTone,
  ItineraryRecipientMode,
  ItinerarySessionInput,
  OtpPurpose,
  RecipientAddress,
  ResolvedItinerarySession,
} from "./types";

function createGmailTransporter() {
  const env = getEnv();
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
    // Timeout ketat agar tetap jauh di bawah batas eksekusi 10 detik Vercel Hobby.
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7500,
  });
}

function formatAddress(recipient: RecipientAddress): string {
  const safeEmail = sanitizeEmailHeaderValue(recipient.email, 160).replace(/\s+/g, "");
  if (!recipient.name?.trim()) {
    return safeEmail;
  }
  const safeName = sanitizeSenderDisplayName(recipient.name, "");
  if (!safeName) {
    return safeEmail;
  }
  return `"${safeName}" <${safeEmail}>`;
}

interface LayeredEmailParams {
  fromName: string;
  to: RecipientAddress[];
  subject: string;
  text: string;
  html: string;
  inlineIcs?: string;
  icsAttachments?: Array<{ filename: string; content: string }>;
  entityRefId?: string;
}

export interface LayeredEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

function normalizeSmtpAddressList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "address" in item && typeof item.address === "string") {
        return item.address.trim();
      }
      return "";
    })
    .filter(Boolean);
}

async function sendLayeredEmail(params: LayeredEmailParams): Promise<LayeredEmailResult> {
  const env = getEnv();
  const transporter = createGmailTransporter();
  const safeFromName = sanitizeSenderDisplayName(params.fromName, env.SENDER_NAME);

  const safeSubject = sanitizeEmailHeaderValue(params.subject, 180) || "Pengingat Jadwal";
  const mailOptions: Mail.Options = {
    from: `"${safeFromName}" <${env.GMAIL_USER}>`,
    to: params.to.map(formatAddress),
    subject: safeSubject,
    text: params.text,
    html: params.html,
    headers: params.entityRefId
      ? {
          "X-Entity-Ref-ID": params.entityRefId,
        }
      : undefined,
  };

  if (params.inlineIcs) {
    mailOptions.alternatives = [
      {
        contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
        content: params.inlineIcs,
      },
    ];
  }

  if (params.icsAttachments && params.icsAttachments.length > 0) {
    mailOptions.attachments = params.icsAttachments.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
      contentDisposition: "attachment" as const,
    }));
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    const accepted = normalizeSmtpAddressList(info.accepted);
    const rejected = normalizeSmtpAddressList(info.rejected);

    if (accepted.length === 0) {
      const error = new Error(
        rejected.length > 0
          ? `Server SMTP menolak seluruh penerima: ${rejected.join(", ")}`
          : "Server SMTP tidak menerima alamat penerima mana pun.",
      );
      error.name = "SmtpNoAcceptedRecipientsError";
      throw error;
    }

    return {
      messageId: info.messageId,
      accepted,
      rejected,
    };
  } finally {
    transporter.close();
  }
}

export async function sendAttendanceReminder(params: {
  stage: AttendanceStage | "manual";
  dateWib: string;
  recipient: { name: string; email: string };
  senderName?: string;
  confirmUrl: string;
  includeIcs: boolean;
  customMessage?: string | null;
  morningScheduleTime?: string;
  scheduledTimeWib?: string;
}): Promise<{ messageId: string }> {
  const env = getEnv();
  const safeSenderName = sanitizeSenderDisplayName(params.senderName, env.SENDER_NAME);
  const recipientAddress: RecipientAddress = {
    name: params.recipient.name,
    email: params.recipient.email,
  };
  const cleanMessage = params.customMessage?.trim() || null;

  let inlineIcs: string | undefined;
  let icsAttachments: Array<{ filename: string; content: string }> | undefined;
  let calendarSlot:
    | {
        startTime: string;
        endTime: string;
        dtStartUtc: string;
        dtEndUtc: string;
        summary: string;
      }
    | undefined;

  if (params.includeIcs) {
    const morningStart = params.morningScheduleTime ?? "09:00";
    const resolvedSlot =
      params.stage === "manual"
        ? (() => {
            const manual = getManualAttendanceSlot();
            const range = resolveWibSessionUtcRange(manual.date, manual.startTime, manual.endTime);
            return {
              date: manual.date,
              startTime: manual.startTime,
              endTime: manual.endTime,
              dtStartUtc: range.dtStartUtc,
              dtEndUtc: range.dtEndUtc,
            };
          })()
        : buildAttendanceCalendarSlot(params.dateWib, morningStart, 30);

    const summary = `Pengingat Absen ${params.recipient.name} (${resolvedSlot.date})`;

    calendarSlot = {
      startTime: resolvedSlot.startTime,
      endTime: resolvedSlot.endTime,
      dtStartUtc: resolvedSlot.dtStartUtc,
      dtEndUtc: resolvedSlot.dtEndUtc,
      summary,
    };

    const icsContent = generateIcsCalendar([
      {
        uidSeed: `attendance:${resolvedSlot.date}:${params.stage}:${resolvedSlot.startTime}`,
        summary,
        date: resolvedSlot.date,
        startTime: resolvedSlot.startTime,
        endTime: resolvedSlot.endTime,
        description: [
          `Pengingat absen harian untuk ${params.recipient.name}.`,
          cleanMessage ? `Pesan khusus: ${cleanMessage}` : "",
          `Konfirmasi absen: ${params.confirmUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        organizer: { name: safeSenderName, email: env.GMAIL_USER },
        attendees: [recipientAddress],
        alarmMinutes: 15,
      },
    ]);

    inlineIcs = icsContent;
    icsAttachments = [{ filename: `absen-${resolvedSlot.date}.ics`, content: icsContent }];
  }

  const email = buildAttendanceReminderEmail({
    stage: params.stage,
    dateWib: params.dateWib,
    recipientName: params.recipient.name,
    senderName: safeSenderName,
    confirmUrl: params.confirmUrl,
    customMessage: cleanMessage,
    scheduledTimeWib: params.scheduledTimeWib,
    calendarSlot,
  });

  return sendLayeredEmail({
    fromName: safeSenderName,
    to: [recipientAddress],
    subject: email.subject,
    text: email.text,
    html: email.html,
    inlineIcs,
    icsAttachments,
  });
}

export interface UrgentDispatchResult {
  partner: { ok: boolean; messageId?: string; error?: string };
  escalation: { ok: boolean; messageId?: string; error?: string };
}

export async function sendUrgentWithEscalation(params: {
  dateWib: string;
  recipient: { name: string; email: string };
  senderName?: string;
  confirmUrl: string;
  dashboardUrl: string;
  customMessage?: string | null;
  scheduledTimeWib?: string;
}): Promise<UrgentDispatchResult> {
  const env = getEnv();
  const safeSenderName = sanitizeSenderDisplayName(params.senderName, env.SENDER_NAME);

  const escalationEmail = buildEscalationEmail({
    dateWib: params.dateWib,
    recipientName: params.recipient.name,
    recipientEmail: params.recipient.email,
    senderName: safeSenderName,
    dashboardUrl: params.dashboardUrl,
    confirmUrl: params.confirmUrl,
    scheduledTimeWib: params.scheduledTimeWib,
  });

  const [partnerResult, escalationResult] = await Promise.allSettled([
    sendAttendanceReminder({
      stage: "urgent",
      dateWib: params.dateWib,
      recipient: params.recipient,
      senderName: safeSenderName,
      confirmUrl: params.confirmUrl,
      includeIcs: false,
      customMessage: params.customMessage,
      scheduledTimeWib: params.scheduledTimeWib,
    }),
    sendLayeredEmail({
      fromName: safeSenderName,
      to: [{ name: safeSenderName, email: env.MY_EMAIL }],
      subject: escalationEmail.subject,
      text: escalationEmail.text,
      html: escalationEmail.html,
    }),
  ]);

  return {
    partner:
      partnerResult.status === "fulfilled"
        ? { ok: true, messageId: partnerResult.value.messageId }
        : {
            ok: false,
            error:
              partnerResult.reason instanceof Error
                ? partnerResult.reason.message
                : "Gagal mengirim email urgent ke penerima utama",
          },
    escalation:
      escalationResult.status === "fulfilled"
        ? { ok: true, messageId: escalationResult.value.messageId }
        : {
            ok: false,
            error:
              escalationResult.reason instanceof Error
                ? escalationResult.reason.message
                : "Gagal mengirim email eskalasi",
          },
  };
}

export async function sendItineraryInvitation(params: {
  mode: ItineraryRecipientMode;
  recipients: RecipientAddress[];
  senderName?: string;
  recipientName?: string;
  categoryLabel?: string;
  messageTone?: ItineraryMessageTone;
  customIntroMessage?: string;
  subject: string;
  sessions: ItinerarySessionInput[];
  alarmMinutes: AlarmMinutes;
  icsMode: IcsBundleMode;
}): Promise<{
  batchId: string;
  messageId: string;
  accepted: string[];
  rejected: string[];
  recipientCount: number;
  sessionCount: number;
  attachmentFilenames: string[];
}> {
  const env = getEnv();
  const safeSenderName = sanitizeSenderDisplayName(params.senderName, env.SENDER_NAME);
  const organizer = { name: safeSenderName, email: env.GMAIL_USER };
  const batchId = crypto.randomUUID();

  const resolvedSessions: ResolvedItinerarySession[] = params.sessions.map((session) => {
    const range = resolveWibSessionUtcRange(session.date, session.startTime, session.endTime);
    return {
      ...session,
      endDateWib: range.endDateWib,
      crossesMidnight: range.crossesMidnight,
      durationMinutes: range.durationMinutes,
      dtStartUtc: range.dtStartUtc,
      dtEndUtc: range.dtEndUtc,
    };
  });

  const batchSeed = `${batchId}:${params.mode}:${params.subject}:${resolvedSessions
    .map((s) => `${s.date}-${s.startTime}-${s.title}`)
    .join("|")}`;

  const icsEvents = resolvedSessions.map((session, index) => ({
    uidSeed: `itinerary:${batchSeed}:stop-${index + 1}`,
    summary: session.title,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    description: session.description,
    locationName: session.locationName,
    mapsUrl: session.mapsUrl,
    organizer,
    attendees: params.recipients,
    alarmMinutes: params.alarmMinutes,
  }));

  const combinedIcs = generateIcsCalendar(icsEvents);
  const useSeparateAttachments = resolvedSessions.length > 1 && params.icsMode === "separate";

  const icsAttachments = useSeparateAttachments
    ? icsEvents.map((eventItem, index) => ({
        filename: `${String(index + 1).padStart(2, "0")}-${slugifyIcsFilename(eventItem.summary, `sesi-${index + 1}`)}`,
        content: generateIcsCalendar([eventItem]),
      }))
    : [
        {
          filename: slugifyIcsFilename(params.subject, "undangan-itinerary"),
          content: combinedIcs,
        },
      ];

  const email = buildItineraryEmail({
    mode: params.mode,
    subject: params.subject,
    senderName: safeSenderName,
    recipientName: params.recipientName,
    categoryLabel: params.categoryLabel,
    messageTone: params.messageTone,
    customIntroMessage: params.customIntroMessage,
    sessions: resolvedSessions,
    icsMode: useSeparateAttachments ? "separate" : "combined",
    alarmMinutes: params.alarmMinutes,
  });

  const sent = await sendLayeredEmail({
    fromName: safeSenderName,
    to: params.recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
    inlineIcs: combinedIcs,
    icsAttachments,
    entityRefId: batchId,
  });

  return {
    batchId,
    messageId: sent.messageId,
    accepted: sent.accepted,
    rejected: sent.rejected,
    recipientCount: sent.accepted.length,
    sessionCount: resolvedSessions.length,
    attachmentFilenames: icsAttachments.map((a) => a.filename),
  };
}

export async function sendPinResetOtpEmail(params: {
  purpose?: OtpPurpose;
  otp: string;
  requestedAtWibLabel: string;
  senderName?: string;
}): Promise<LayeredEmailResult> {
  const env = getEnv();
  const safeSenderName = sanitizeSenderDisplayName(params.senderName, env.SENDER_NAME);
  const email = buildPinResetOtpEmail({
    purpose: params.purpose,
    otp: params.otp,
    requestedAtWibLabel: params.requestedAtWibLabel,
    senderName: safeSenderName,
  });

  return sendLayeredEmail({
    fromName: safeSenderName,
    to: [{ name: safeSenderName, email: env.MY_EMAIL }],
    subject: email.subject,
    text: email.text,
    html: email.html,
    entityRefId: `pin-otp-${params.purpose ?? "forgot_reset"}-${crypto.randomUUID()}`,
  });
}

export async function sendPinResetSuccessEmail(params: {
  purpose?: OtpPurpose;
  resetAtWibLabel: string;
  senderName?: string;
}): Promise<LayeredEmailResult> {
  const env = getEnv();
  const safeSenderName = sanitizeSenderDisplayName(params.senderName, env.SENDER_NAME);
  const email = buildPinResetSuccessEmail({
    purpose: params.purpose,
    resetAtWibLabel: params.resetAtWibLabel,
    senderName: safeSenderName,
  });

  return sendLayeredEmail({
    fromName: safeSenderName,
    to: [{ name: safeSenderName, email: env.MY_EMAIL }],
    subject: email.subject,
    text: email.text,
    html: email.html,
    entityRefId: `pin-updated-${params.purpose ?? "forgot_reset"}-${crypto.randomUUID()}`,
  });
}
