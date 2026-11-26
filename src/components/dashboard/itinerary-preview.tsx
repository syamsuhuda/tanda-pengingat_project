"use client";

import { Calendar, Clock, ExternalLink, MapPin, Paperclip, Users } from "lucide-react";
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
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6 lg:sticky lg:top-20"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="itinerary-preview-heading"
          className="font-display text-xl font-semibold text-[var(--ink)]"
        >
          Pratinjau Timeline
        </h2>
        <span className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-muted)]">
          {mode === "date" ? "Date Itinerary" : "Acara Teman"}
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3.5 text-xs text-[var(--ink-muted)]">
        <p className="text-sm font-semibold text-[var(--ink)]">
          {subject.trim() || "Subjek email belum diisi"}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {mode === "date"
              ? `${partnerName} (1 penerima)`
              : `${recipientCount} penerima dipilih`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Alarm {alarmMinutes} menit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {icsLabel}
          </span>
        </div>
      </div>

      <ol className="mt-5 space-y-4">
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
              className="relative pl-7 before:absolute before:top-2 before:bottom-[-16px] before:left-[9px] before:w-px before:bg-[var(--border-subtle)] last:before:hidden"
            >
              <span
                aria-hidden="true"
                className="font-mono-num absolute top-0.5 left-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-[var(--accent-fg)]"
              >
                {index + 1}
              </span>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg)] p-3.5">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {session.title.trim() || `Sesi ${index + 1} (judul belum diisi)`}
                </p>

                <div className="mt-1.5 space-y-1 text-xs text-[var(--ink-muted)]">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      {isValidYmdDate(session.date)
                        ? formatWibDateIndonesian(session.date)
                        : "Tanggal belum valid"}
                    </span>
                  </p>

                  <p className="font-mono-num flex flex-wrap items-center gap-1.5 text-[var(--ink)]">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" strokeWidth={1.75} aria-hidden="true" />
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
                    <p className="inline-block rounded bg-[var(--warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-fg)]">
                      Lintas tengah malam (+1 hari, selesai{" "}
                      {formatWibDateShortIndonesian(rangeInfo.endDateWib)})
                    </p>
                  ) : null}

                  {session.locationName?.trim() || session.mapsUrl?.trim() ? (
                    <p className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span>{session.locationName?.trim() || "Tautan lokasi"}</span>
                      {session.mapsUrl?.trim() ? (
                        <a
                          href={session.mapsUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-[var(--accent)] hover:underline"
                        >
                          <span>Maps</span>
                          <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
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
