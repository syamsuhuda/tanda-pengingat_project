import crypto from "node:crypto";
import {
  addMinutesToHmTime,
  formatUtcDateForIcs,
  resolveWibSessionUtcRange,
  WIB_TIMEZONE,
} from "./timezone";
import type { RecipientAddress } from "./types";

export function buildAttendanceCalendarSlot(
  dateWib: string,
  startTimeWib: string,
  durationMinutes = 30,
): {
  date: string;
  startTime: string;
  endTime: string;
  dtStartUtc: string;
  dtEndUtc: string;
} {
  const endTime = addMinutesToHmTime(startTimeWib, durationMinutes);
  const range = resolveWibSessionUtcRange(dateWib, startTimeWib, endTime);
  return {
    date: dateWib,
    startTime: startTimeWib,
    endTime,
    dtStartUtc: range.dtStartUtc,
    dtEndUtc: range.dtEndUtc,
  };
}

const MAX_ICS_LINE_OCTETS = 75;

export interface IcsEventInput {
  uidSeed: string;
  summary: string;
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
  locationName?: string;
  mapsUrl?: string;
  organizer: {
    name: string;
    email: string;
  };
  attendees: RecipientAddress[];
  alarmMinutes: number;
  dtStamp?: Date;
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function escapeIcsParamValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/"/g, "'")
    .trim();
}

// RFC 5545 Section 3.1: batas baris adalah 75 octet UTF-8, dipotong pada batas code point agar karakter multi-byte tidak rusak.
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= MAX_ICS_LINE_OCTETS) {
    return line;
  }

  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (currentBytes + charBytes > MAX_ICS_LINE_OCTETS && current.length > 0) {
      folded.push(current);
      current = ` ${char}`;
      currentBytes = 1 + charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current.length > 0) {
    folded.push(current);
  }

  return folded.join("\r\n");
}

export function buildDeterministicUid(seed: string): string {
  const hash = crypto.createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 24);
  return `${hash}@pengingat-jadwal.app`;
}

export function buildGoogleCalendarTemplateUrl(params: {
  title: string;
  dtStartUtc: string;
  dtEndUtc: string;
  description?: string;
  locationName?: string;
  mapsUrl?: string;
}): string {
  const detailsParts: string[] = [];
  if (params.description?.trim()) {
    detailsParts.push(params.description.trim());
  }
  if (params.mapsUrl?.trim()) {
    detailsParts.push(`Google Maps: ${params.mapsUrl.trim()}`);
  }

  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${params.dtStartUtc}/${params.dtEndUtc}`,
    ctz: WIB_TIMEZONE,
  });

  if (detailsParts.length > 0) {
    query.set("details", detailsParts.join("\n\n"));
  }
  if (params.locationName?.trim()) {
    query.set("location", params.locationName.trim());
  }

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export function slugifyIcsFilename(title: string, fallback: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${normalized || fallback}.ics`;
}

export function generateIcsCalendar(events: IcsEventInput[]): string {
  if (events.length === 0) {
    throw new Error("Minimal satu event dibutuhkan untuk membuat file ICS.");
  }

  const rawLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pengingat Jadwal//Calendar Engine//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    `X-WR-TIMEZONE:${WIB_TIMEZONE}`,
  ];

  for (const event of events) {
    const range = resolveWibSessionUtcRange(event.date, event.startTime, event.endTime);
    const dtStampUtc = formatUtcDateForIcs(event.dtStamp ?? new Date());
    const organizerName = escapeIcsParamValue(event.organizer.name);
    const safeAlarmMinutes = Math.max(1, Math.round(event.alarmMinutes));

    const descriptionParts: string[] = [];
    if (event.description?.trim()) {
      descriptionParts.push(event.description.trim());
    }
    if (event.mapsUrl?.trim()) {
      descriptionParts.push(`Google Maps: ${event.mapsUrl.trim()}`);
    }
    const combinedDescription = descriptionParts.join("\n\n");

    rawLines.push("BEGIN:VEVENT");
    rawLines.push(`UID:${buildDeterministicUid(event.uidSeed)}`);
    rawLines.push(`DTSTAMP:${dtStampUtc}`);
    rawLines.push(`DTSTART:${range.dtStartUtc}`);
    rawLines.push(`DTEND:${range.dtEndUtc}`);
    rawLines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

    if (combinedDescription) {
      rawLines.push(`DESCRIPTION:${escapeIcsText(combinedDescription)}`);
    }
    if (event.locationName?.trim()) {
      rawLines.push(`LOCATION:${escapeIcsText(event.locationName.trim())}`);
    }
    if (event.mapsUrl?.trim()) {
      rawLines.push(`URL:${event.mapsUrl.trim()}`);
    }

    rawLines.push(`ORGANIZER;CN="${organizerName}":mailto:${event.organizer.email}`);

    for (const attendee of event.attendees) {
      const cnPart = attendee.name?.trim()
        ? `;CN="${escapeIcsParamValue(attendee.name.trim())}"`
        : "";
      rawLines.push(
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cnPart}:mailto:${attendee.email}`,
      );
    }

    rawLines.push("STATUS:CONFIRMED");
    rawLines.push("SEQUENCE:0");
    rawLines.push("TRANSP:OPAQUE");
    rawLines.push("BEGIN:VALARM");
    rawLines.push("ACTION:DISPLAY");
    rawLines.push(`TRIGGER:-PT${safeAlarmMinutes}M`);
    rawLines.push(`DESCRIPTION:${escapeIcsText(`Pengingat: ${event.summary}`)}`);
    rawLines.push("END:VALARM");
    rawLines.push("END:VEVENT");
  }

  rawLines.push("END:VCALENDAR");

  const foldedLines = rawLines.map((line) => foldIcsLine(line));
  return `${foldedLines.join("\r\n")}\r\n`;
}
