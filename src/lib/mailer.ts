import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { getEnv } from "./env";
import {
  buildAttendanceReminderEmail,
  buildEscalationEmail,
  buildItineraryEmail,
} from "./email-templates";
import { generateIcsCalendar, slugifyIcsFilename } from "./ics";
import { getManualAttendanceSlot, resolveWibSessionUtcRange } from "./timezone";
import type {
  AlarmMinutes,
  AttendanceStage,
  IcsBundleMode,
  ItineraryRecipientMode,
  ItinerarySessionInput,
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
  if (!recipient.name?.trim()) {
    return recipient.email;
  }
  const safeName = recipient.name.replace(/["\r\n]+/g, "").trim();
  return `"${safeName}" <${recipient.email}>`;
}

interface LayeredEmailParams {
  to: RecipientAddress[];
  subject: string;
  text: string;
  html: string;
  inlineIcs?: string;
  icsAttachments?: Array<{ filename: string; content: string }>;
}

async function sendLayeredEmail(params: LayeredEmailParams): Promise<{ messageId: string }> {
  const env = getEnv();
  const transporter = createGmailTransporter();

  const mailOptions: Mail.Options = {
    from: formatAddress({ name: env.SENDER_NAME, email: env.GMAIL_USER }),
    to: params.to.map(formatAddress),
    subject: params.subject,
    text: params.text,
    html: params.html,
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

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}

export async function sendAttendanceReminder(params: {
  stage: AttendanceStage | "manual";
  dateWib: string;
  confirmUrl: string;
  includeIcs: boolean;
  note?: string;
}): Promise<{ messageId: string }> {
  const env = getEnv();
  const partner: RecipientAddress = {
    name: env.PARTNER_NAME,
    email: env.PARTNER_EMAIL,
  };

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
    const slot =
      params.stage === "manual"
        ? getManualAttendanceSlot()
        : { date: params.dateWib, startTime: "09:00", endTime: "09:30" };

    const summary = `Pengingat Absen Harian (${slot.date})`;
    const range = resolveWibSessionUtcRange(slot.date, slot.startTime, slot.endTime);

    calendarSlot = {
      startTime: slot.startTime,
      endTime: slot.endTime,
      dtStartUtc: range.dtStartUtc,
      dtEndUtc: range.dtEndUtc,
      summary,
    };

    const icsContent = generateIcsCalendar([
      {
        uidSeed: `attendance:${slot.date}:${params.stage}:${slot.startTime}`,
        summary,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        description: [
          `Pengingat absen harian untuk ${env.PARTNER_NAME}.`,
          params.note ? `Catatan: ${params.note}` : "",
          `Konfirmasi absen: ${params.confirmUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        organizer: { name: env.SENDER_NAME, email: env.GMAIL_USER },
        attendees: [partner],
        alarmMinutes: 15,
      },
    ]);

    inlineIcs = icsContent;
    icsAttachments = [{ filename: `absen-${slot.date}.ics`, content: icsContent }];
  }

  const email = buildAttendanceReminderEmail({
    stage: params.stage,
    dateWib: params.dateWib,
    partnerName: env.PARTNER_NAME,
    senderName: env.SENDER_NAME,
    confirmUrl: params.confirmUrl,
    note: params.note,
    calendarSlot,
  });

  return sendLayeredEmail({
    to: [partner],
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
  confirmUrl: string;
  dashboardUrl: string;
}): Promise<UrgentDispatchResult> {
  const env = getEnv();

  const escalationEmail = buildEscalationEmail({
    dateWib: params.dateWib,
    partnerName: env.PARTNER_NAME,
    partnerEmail: env.PARTNER_EMAIL,
    senderName: env.SENDER_NAME,
    dashboardUrl: params.dashboardUrl,
    confirmUrl: params.confirmUrl,
  });

  const [partnerResult, escalationResult] = await Promise.allSettled([
    sendAttendanceReminder({
      stage: "urgent",
      dateWib: params.dateWib,
      confirmUrl: params.confirmUrl,
      includeIcs: false,
    }),
    sendLayeredEmail({
      to: [{ name: env.SENDER_NAME, email: env.MY_EMAIL }],
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
  subject: string;
  sessions: ItinerarySessionInput[];
  alarmMinutes: AlarmMinutes;
  icsMode: IcsBundleMode;
}): Promise<{
  messageId: string;
  recipientCount: number;
  sessionCount: number;
  attachmentFilenames: string[];
}> {
  const env = getEnv();
  const organizer = { name: env.SENDER_NAME, email: env.GMAIL_USER };

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

  const batchSeed = `${params.mode}:${params.subject}:${resolvedSessions
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
    senderName: env.SENDER_NAME,
    sessions: resolvedSessions,
    icsMode: useSeparateAttachments ? "separate" : "combined",
    alarmMinutes: params.alarmMinutes,
  });

  const sent = await sendLayeredEmail({
    to: params.recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
    inlineIcs: combinedIcs,
    icsAttachments,
  });

  return {
    messageId: sent.messageId,
    recipientCount: params.recipients.length,
    sessionCount: resolvedSessions.length,
    attachmentFilenames: icsAttachments.map((a) => a.filename),
  };
}
