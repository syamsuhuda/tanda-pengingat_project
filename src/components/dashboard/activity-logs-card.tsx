"use client";

import { useMemo, useState } from "react";
import { formatIsoToWibDateTime } from "@/lib/timezone";
import type { ActivityLogEntry, ActivityLogType } from "@/lib/types";

interface ActivityLogsCardProps {
  logs: ActivityLogEntry[];
}

type LogFilter = "all" | "attendance" | "dispatch";

function getLogCategory(type: ActivityLogType): "attendance" | "dispatch" | "system" {
  if (type === "attendance_confirmed" || type === "attendance_reset") {
    return "attendance";
  }
  if (
    type === "cron_morning" ||
    type === "cron_afternoon" ||
    type === "cron_urgent" ||
    type === "manual_reminder" ||
    type === "itinerary_sent"
  ) {
    return "dispatch";
  }
  return "system";
}

const DOT_COLOR_BY_CAT = {
  attendance: "bg-emerald-400",
  dispatch: "bg-orange-400",
  system: "bg-sky-400",
} as const;

const RESULT_BADGE: Record<
  ActivityLogEntry["result"],
  { label: string; className: string }
> = {
  success: {
    label: "OK",
    className: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  },
  skipped: {
    label: "Lewat",
    className: "bg-[var(--surface-muted)] text-[var(--ink-muted)]",
  },
  partial: {
    label: "Sebagian",
    className: "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  },
  error: {
    label: "Gagal",
    className: "bg-[var(--danger-bg)] text-[var(--danger-fg)]",
  },
};

export function ActivityLogsCard({ logs }: ActivityLogsCardProps) {
  const [filter, setFilter] = useState<LogFilter>("all");

  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((entry) => getLogCategory(entry.type) === filter);
  }, [logs, filter]);

  return (
    <section
      aria-labelledby="activity-logs-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2
            id="activity-logs-heading"
            className="font-display text-lg font-semibold text-[var(--ink)]"
          >
            Log Aktivitas Terakhir
          </h2>
          <span className="font-mono-num text-xs text-[var(--ink-muted)]">
            ({filteredLogs.length})
          </span>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Filter log aktivitas">
          {(
            [
              { key: "all", label: "Semua" },
              { key: "attendance", label: "Absen" },
              { key: "dispatch", label: "Kirim" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`min-h-[38px] rounded-lg px-2.5 text-xs font-semibold transition-colors sm:min-h-[32px] ${
                filter === item.key
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 text-center text-xs text-[var(--ink-muted)]">
          {logs.length === 0
            ? "Belum ada aktivitas tercatat. Riwayat cron, konfirmasi, dan undangan akan muncul di sini."
            : "Belum ada aktivitas pada filter ini."}
        </div>
      ) : (
        <ul className="custom-scrollbar mt-4 max-h-[280px] space-y-2 overflow-y-auto overscroll-contain pr-1.5 sm:max-h-[360px]">
          {filteredLogs.map((entry) => {
            const category = getLogCategory(entry.type);
            const badge = RESULT_BADGE[entry.result];
            return (
              <li
                key={entry.id}
                className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-2.5 pr-3 pl-7"
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-3.5 left-3 h-2 w-2 rounded-full ${DOT_COLOR_BY_CAT[category]}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-num text-[11px] text-[var(--ink-muted)]">
                    {formatIsoToWibDateTime(entry.timestamp)}
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--ink)]">
                  {entry.summary}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
