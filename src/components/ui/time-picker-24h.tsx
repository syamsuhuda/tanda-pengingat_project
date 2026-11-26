"use client";

import { useMemo } from "react";

interface TimePicker24hProps {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  stepMinutes?: 1 | 5 | 10 | 15 | 30;
  ariaLabel?: string;
  className?: string;
}

const HOURS_24 = Array.from({ length: 24 }, (_, idx) => String(idx).padStart(2, "0"));

function parseHmParts(raw: string): { hour: string; minute: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match || !match[1] || !match[2]) {
    return { hour: "09", minute: "00" };
  }
  return { hour: match[1], minute: match[2] };
}

export function TimePicker24h({
  id,
  value,
  onChange,
  disabled = false,
  stepMinutes = 1,
  ariaLabel = "Pilih waktu 24 jam WIB",
  className = "",
}: TimePicker24hProps) {
  const { hour, minute } = parseHmParts(value);

  const minuteOptions = useMemo(() => {
    const list: string[] = [];
    for (let m = 0; m < 60; m += stepMinutes) {
      list.push(String(m).padStart(2, "0"));
    }
    if (!list.includes(minute)) {
      list.push(minute);
      list.sort();
    }
    return list;
  }, [stepMinutes, minute]);

  return (
    <div
      className={`inline-flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-[var(--ink)] transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] ${
        disabled ? "opacity-55" : ""
      } ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <select
          id={id}
          aria-label={`${ariaLabel} - Jam`}
          disabled={disabled}
          value={hour}
          onChange={(event) => onChange(`${event.target.value}:${minute}`)}
          className="font-mono-num min-h-[40px] min-w-0 flex-1 bg-transparent py-1 text-center text-base font-semibold text-[var(--ink)] focus:outline-none disabled:cursor-not-allowed sm:text-sm"
        >
          {HOURS_24.map((h) => (
            <option key={h} value={h} className="bg-[var(--surface)] text-[var(--ink)]">
              {h}
            </option>
          ))}
        </select>

        <span className="font-mono-num shrink-0 text-sm font-bold text-[var(--ink-muted)]" aria-hidden="true">
          :
        </span>

        <select
          id={id ? `${id}-minute` : undefined}
          aria-label={`${ariaLabel} - Menit`}
          disabled={disabled}
          value={minute}
          onChange={(event) => onChange(`${hour}:${event.target.value}`)}
          className="font-mono-num min-h-[40px] min-w-0 flex-1 bg-transparent py-1 text-center text-base font-semibold text-[var(--ink)] focus:outline-none disabled:cursor-not-allowed sm:text-sm"
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m} className="bg-[var(--surface)] text-[var(--ink)]">
              {m}
            </option>
          ))}
        </select>
      </div>

      <span className="shrink-0 rounded-md bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[var(--ink-muted)]">
        WIB
      </span>
    </div>
  );
}
