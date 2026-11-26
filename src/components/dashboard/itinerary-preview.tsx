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
  senderName: string;
  categoryLabel: string;
  introMessage: string;
  recipientCount: number;
  recipientSummary?: string;
  partnerName: string;
  subject: string;
  alarmMinutes: AlarmMinutes;
  icsMode: IcsBundleMode;
  sessions: ItinerarySessionInput[];
  activeSessionIndex?: number;
  onSelectSession?: (index: number) => void;
  footerActions?: React.ReactNode;
  sticky?: boolean;
}

export function ItineraryPreview({
  mode,
  senderName,
  categoryLabel,
  introMessage,
  recipientCount,
  recipientSummary,
  partnerName,
  subject,
  alarmMinutes,
  icsMode,
  sessions,
  activeSessionIndex,
  onSelectSession,
  footerActions,
  sticky = true,
}: ItineraryPreviewProps) {
  const displaySender = senderName.trim() || "Pengirim";
  const displayCategory = categoryLabel.trim() || (mode === "date" ? "Date Plan" : "Event Plan");
  const displayIntro = introMessage.trim();
  const displayRecipient =
    recipientSummary?.trim() ||
    (mode === "date" ? `${partnerName} (1)` : `${recipientCount} penerima`);

  const icsLabel =
    sessions.length <= 1
      ? "1 file kalender"
      : icsMode === "separate"
        ? `${sessions.length} file terpisah`
        : "1 file gabungan";

  const totalMinutes = sessions.reduce((acc, session) => {
    if (
      !isValidYmdDate(session.date) ||
      !isValidHmTime(session.startTime) ||
      !isValidHmTime(session.endTime) ||
      session.startTime === session.endTime
    ) {
      return acc;
    }
    try {
      const r = resolveWibSessionUtcRange(session.date, session.startTime, session.endTime);
      return acc + r.durationMinutes;
    } catch {
      return acc;
    }
  }, 0);

  return (
    <aside
      aria-labelledby="itinerary-preview-heading"
      className={`flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-xs ${
        sticky ? "lg:sticky lg:top-20 lg:max-h-[calc(100vh-112px)]" : ""
      }`}
    >
      <div className="shrink-0 border-b border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
            <Ticket className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>{displayCategory}</span>
          </span>
          <span className="font-mono-num text-[11px] font-semibold text-[var(--ink-muted)]">
            {sessions.length} sesi{totalMinutes > 0 ? ` · ${formatDurationIndonesian(totalMinutes)}` : ""}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-medium text-[var(--ink-muted)]">
          <span>
            Dari: <strong className="font-semibold text-[var(--ink)]">{displaySender}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Kepada: <strong className="font-semibold text-[var(--ink)]">{displayRecipient}</strong>
          </span>
        </div>

        <h2
          id="itinerary-preview-heading"
          className="font-display mt-1.5 text-lg font-bold text-[var(--ink)] sm:text-xl"
        >
          {subject.trim() || "Judul Rencana Kamu"}
        </h2>

        {displayIntro ? (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-[var(--ink-muted)]">
            {displayIntro}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-medium text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
            {mode === "date" ? `${partnerName} (1)` : `${recipientCount} penerima`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
            Pengingat {alarmMinutes} mnt
          </span>
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
            {icsLabel}
          </span>
        </div>
      </div>

      <ol className="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
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

          const isSelected = activeSessionIndex === index;

          return (
            <li
              key={`preview-${index}`}
              className="relative pl-8 before:absolute before:top-3 before:bottom-[-12px] before:left-[11px] before:w-0.5 before:bg-[var(--border-subtle)] last:before:hidden"
            >
              <span
                aria-hidden="true"
                className={`font-mono-num absolute top-0.5 left-0 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink)]"
                }`}
              >
                {index + 1}
              </span>

              <div
                onClick={onSelectSession ? () => onSelectSession(index) : undefined}
                role={onSelectSession ? "button" : undefined}
                tabIndex={onSelectSession ? 0 : undefined}
                onKeyDown={
                  onSelectSession
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectSession(index);
                        }
                      }
                    : undefined
                }
                className={`rounded-xl border p-3 transition-colors ${
                  onSelectSession ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-[var(--border-control)]"
                }`}
              >
                <p className="text-sm font-bold text-[var(--ink)]">
                  {session.title.trim() || `Sesi ${index + 1}`}
                </p>

                <div className="mt-1 space-y-1 text-xs text-[var(--ink-muted)]">
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
                    <p className="inline-block rounded-md bg-[var(--warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-fg)]">
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
                          onClick={(event) => event.stopPropagation()}
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

      {footerActions ? (
        <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
          {footerActions}
        </div>
      ) : null}
    </aside>
  );
}
