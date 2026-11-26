"use client";

import { Calendar, Clock, ExternalLink, MapPin, Paperclip, Ticket, Users } from "lucide-react";
import {
  formatDurationIndonesian,
  formatWibDateIndonesian,
  formatWibDateShortIndonesian,
  isValidHmTime,
  isValidYmdDate,
  resolveWibSessionUtcRange,
} from "@/lib/timezone";
import type {
  AlarmMinutes,
  IcsBundleMode,
  ItineraryRecipientMode,
  ItinerarySessionInput,
} from "@/lib/types";

interface ItineraryPreviewProps {
  mode: ItineraryRecipientMode;
  recipientCount: number;
  partnerName: string;
  subject: string;
  alarmMinutes: AlarmMinutes;
  icsMode: IcsBundleMode;
  sessions: ItinerarySessionInput[];
}

export function ItineraryPreview({
  mode,
  recipientCount,
  partnerName,
  subject,
  alarmMinutes,
  icsMode,
  sessions,
}: ItineraryPreviewProps) {
  const icsLabel =
    sessions.length <= 1
      ? "1 file .ics"
      : icsMode === "separate"
        ? `${sessions.length} file .ics terpisah`
        : "1 file .ics gabungan";

  return (
    <aside
      aria-labelledby="itinerary-preview-heading"
      className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-sm lg:sticky lg:top-20"
    >
      <div className="btn-playful-gradient px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">
            <Ticket className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>{mode === "date" ? "Date Ticket" : "Event Pass"}</span>
          </span>
          <span className="font-mono-num text-[11px] font-semibold opacity-90">
            {sessions.length} sesi
          </span>
        </div>

        <h2 id="itinerary-preview-heading" className="font-display mt-2 text-xl font-bold">
          {subject.trim() || "Judul Undangan Kamu"}
        </h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-medium opacity-95">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {mode === "date" ? `${partnerName} (1)` : `${recipientCount} teman`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Alarm {alarmMinutes}m
          </span>
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {icsLabel}
          </span>
        </div>
      </div>

      <div className="border-b border-dashed border-[var(--border-subtle)]" />

      <ol className="space-y-3.5 p-5 sm:p-6">
        {sessions.map((session, index) => {
          const canResolve =
            isValidYmdDate(session.date) &&
            isValidHmTime(session.startTime) &&
            isValidHmTime(session.endTime) &&
            session.startTime !== session.endTime;

          let rangeInfo: ReturnType<typeof resolveWibSessionUtcRange> | null = null;
          if (canResolve) {
            try {
              rangeInfo = resolveWibSessionUtcRange(
                session.date,
                session.startTime,
                session.endTime,
              );
            } catch {
              rangeInfo = null;
            }
          }

          return (
            <li
              key={`preview-${index}`}
              className="relative pl-8 before:absolute before:top-3 before:bottom-[-16px] before:left-[11px] before:w-0.5 before:bg-[var(--border-subtle)] last:before:hidden"
            >
              <span
                aria-hidden="true"
                className="font-mono-num btn-playful-gradient absolute top-0.5 left-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-xs"
              >
                {index + 1}
              </span>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                <p className="text-sm font-bold text-[var(--ink)]">
                  {session.title.trim() || `Sesi ${index + 1}`}
                </p>

                <div className="mt-1.5 space-y-1 text-xs text-[var(--ink-muted)]">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                    <span>
                      {isValidYmdDate(session.date)
                        ? formatWibDateIndonesian(session.date)
                        : "Tanggal belum valid"}
                    </span>
                  </p>

                  <p className="font-mono-num flex flex-wrap items-center gap-1.5 text-[var(--ink)]">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" strokeWidth={1.9} aria-hidden="true" />
                    <span>
                      {session.startTime || "--:--"} - {session.endTime || "--:--"} WIB
                    </span>
                    {rangeInfo ? (
                      <span className="font-sans text-[var(--ink-muted)]">
                        ({formatDurationIndonesian(rangeInfo.durationMinutes)})
                      </span>
                    ) : null}
                  </p>

                  {rangeInfo?.crossesMidnight ? (
                    <p className="inline-block rounded-full bg-[var(--warning-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--warning-fg)]">
                      Lintas tengah malam (+1 hari, selesai{" "}
                      {formatWibDateShortIndonesian(rangeInfo.endDateWib)})
                    </p>
                  ) : null}

                  {session.locationName?.trim() || session.mapsUrl?.trim() ? (
                    <p className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                      <span>{session.locationName?.trim() || "Titik lokasi"}</span>
                      {session.mapsUrl?.trim() ? (
                        <a
                          href={session.mapsUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-[var(--accent)] hover:underline"
                        >
                          <span>Maps</span>
                          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                        </a>
                      ) : null}
                    </p>
                  ) : null}

                  {session.description?.trim() ? (
                    <p className="line-clamp-2 pt-0.5 text-[var(--ink-muted)]">
                      {session.description.trim()}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
