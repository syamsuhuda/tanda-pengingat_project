"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, X } from "lucide-react";

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
const QUICK_MINUTE_CHIPS = ["00", "15", "30", "45"] as const;

function clampNumber(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function parseHmParts(raw: string): { hour: string; minute: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match || !match[1] || !match[2]) {
    return { hour: "09", minute: "00" };
  }
  return { hour: match[1], minute: match[2] };
}

function normalizeTypedHm(raw: string, fallback: string): string {
  const cleaned = raw.trim();
  if (!cleaned) {
    return fallback;
  }

  const colonMatch = /^(\d{1,2})\s*[:.]\s*(\d{1,2})$/.exec(cleaned);
  if (colonMatch && colonMatch[1] && colonMatch[2]) {
    const h = clampNumber(Number(colonMatch[1]), 0, 23);
    const m = clampNumber(Number(colonMatch[2]), 0, 59);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 4) {
    const h = clampNumber(Number(digits.slice(0, 2)), 0, 23);
    const m = clampNumber(Number(digits.slice(2, 4)), 0, 59);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (digits.length === 3) {
    const h = clampNumber(Number(digits.slice(0, 1)), 0, 23);
    const m = clampNumber(Number(digits.slice(1, 3)), 0, 59);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (digits.length === 1 || digits.length === 2) {
    const h = clampNumber(Number(digits), 0, 23);
    return `${String(h).padStart(2, "0")}:00`;
  }

  return fallback;
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
  const safeNormalized = useMemo(() => {
    const { hour, minute } = parseHmParts(value);
    return `${hour}:${minute}`;
  }, [value]);

  const [draftText, setDraftText] = useState(safeNormalized);
  const [isEditing, setIsEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(safeNormalized);
    }
  }, [safeNormalized, isEditing]);

  useEffect(() => {
    if (!pickerOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const { hour, minute } = parseHmParts(safeNormalized);

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

  function commitText(raw: string) {
    const next = normalizeTypedHm(raw, safeNormalized);
    setDraftText(next);
    setIsEditing(false);
    if (next !== safeNormalized) {
      onChange(next);
    }
  }

  function handleInputChange(raw: string) {
    setIsEditing(true);
    const filtered = raw.replace(/[^\d:]/g, "").slice(0, 5);
    const digitsOnly = filtered.replace(/:/g, "");

    if (!filtered.includes(":") && digitsOnly.length === 4) {
      const h = clampNumber(Number(digitsOnly.slice(0, 2)), 0, 23);
      const m = clampNumber(Number(digitsOnly.slice(2, 4)), 0, 59);
      const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      setDraftText(formatted);
      onChange(formatted);
      return;
    }

    setDraftText(filtered);
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(filtered)) {
      onChange(filtered);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitText(draftText);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 1 : -1;
      const total = (Number(hour) * 60 + Number(minute) + delta + 1440) % 1440;
      const next = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      setDraftText(next);
      onChange(next);
    }
  }

  return (
    <div ref={containerRef} className={`relative w-full min-w-0 ${className}`}>
      <div
        className={`inline-flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] pl-2.5 pr-1 text-[var(--ink)] transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] ${
          disabled ? "opacity-55" : ""
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          disabled={disabled}
          aria-label={`${ariaLabel} (format 24 jam HH:mm WIB)`}
          placeholder="09:00"
          value={draftText}
          onFocus={(event) => {
            setIsEditing(true);
            event.currentTarget.select();
          }}
          onChange={(event) => handleInputChange(event.target.value)}
          onBlur={() => commitText(draftText)}
          onKeyDown={handleInputKeyDown}
          className="font-mono-num min-h-[40px] w-full min-w-0 flex-1 bg-transparent py-1 text-base font-semibold tracking-tight text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:cursor-not-allowed sm:text-sm"
        />

        <span className="shrink-0 rounded-md bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[var(--ink-muted)]">
          WIB
        </span>

        <button
          type="button"
          disabled={disabled}
          aria-label={`Buka pemilih jam & menit untuk ${ariaLabel}`}
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((prev) => !prev)}
          className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--ink)] disabled:cursor-not-allowed"
        >
          <Clock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {pickerOpen && !disabled ? (
        <div
          role="dialog"
          aria-label={`Pemilih waktu 24 jam: ${ariaLabel}`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-1.5 sm:block sm:w-[280px] sm:bg-transparent sm:p-0"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPickerOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 shadow-lg sm:w-[280px]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
              <div>
                <p className="text-xs font-bold text-[var(--ink)]">Pilih Waktu (24 Jam)</p>
                <p className="font-mono-num text-sm font-bold text-[var(--accent)]">
                  {hour}:{minute} WIB
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup pemilih waktu"
                onClick={() => setPickerOpen(false)}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {QUICK_MINUTE_CHIPS.map((presetMin) => {
                const active = minute === presetMin;
                return (
                  <button
                    key={presetMin}
                    type="button"
                    onClick={() => {
                      const next = `${hour}:${presetMin}`;
                      setDraftText(next);
                      onChange(next);
                    }}
                    className={`font-mono-num min-h-[34px] flex-1 rounded-lg border px-2 text-xs font-semibold transition-colors ${
                      active
                        ? "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    :{presetMin}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-[var(--ink-muted)]">Jam (00-23)</p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1">
                  {HOURS_24.map((h) => {
                    const selected = h === hour;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          const next = `${h}:${minute}`;
                          setDraftText(next);
                          onChange(next);
                        }}
                        className={`font-mono-num flex min-h-[38px] w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                          selected
                            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold text-[var(--ink-muted)]">Menit (00-59)</p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1">
                  {minuteOptions.map((m) => {
                    const selected = m === minute;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          const next = `${hour}:${m}`;
                          setDraftText(next);
                          onChange(next);
                        }}
                        className={`font-mono-num flex min-h-[38px] w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                          selected
                            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--ink)] text-xs font-bold text-[var(--bg)] transition-opacity hover:opacity-90"
            >
              Selesai
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
