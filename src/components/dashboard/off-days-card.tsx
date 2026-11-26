"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarOff, Check, Plus, X } from "lucide-react";
import { formatWibDateCompactIndonesian } from "@/lib/timezone";
import type { OffDayEntry } from "@/lib/types";

interface OffDaysCardProps {
  todayWib: string;
  tomorrowWib: string;
  upcomingOffDays: OffDayEntry[];
  onChanged: () => Promise<void>;
}

export function OffDaysCard({
  todayWib,
  tomorrowWib,
  upcomingOffDays,
  onChanged,
}: OffDaysCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [dateInput, setDateInput] = useState(tomorrowWib);
  const [noteInput, setNoteInput] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!formOpen) {
      setDateInput(tomorrowWib);
    }
  }, [tomorrowWib, formOpen]);

  async function addCustomDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dateInput) {
      setFeedback({ type: "error", text: "Pilih tanggal libur terlebih dahulu." });
      return;
    }

    setBusyKey("custom");
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/off-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates: [dateInput],
          note: noteInput.trim() || undefined,
        }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menambahkan tanggal libur.",
        });
        return;
      }

      setNoteInput("");
      setFormOpen(false);
      setFeedback({
        type: "success",
        text: body.message ?? "Tanggal libur ditambahkan.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan tanggal libur.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeDate(dateWib: string) {
    setBusyKey(dateWib);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/attendance/off-days?date=${encodeURIComponent(dateWib)}`,
        { method: "DELETE" },
      );

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menghapus tanggal libur.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text: body.message ?? "Tanggal libur dibatalkan.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menghapus tanggal libur.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section
      aria-labelledby="off-days-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="off-days-heading"
            className="font-display text-lg font-semibold text-[var(--ink)]"
          >
            Jadwal Libur Shift
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {upcomingOffDays.length === 0
              ? "Belum ada tanggal libur mendatang."
              : `${upcomingOffDays.length} hari libur terjadwal.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormOpen((prev) => !prev);
            setFeedback(null);
          }}
          aria-expanded={formOpen}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.98]"
        >
          <Plus
            className={`h-4 w-4 transition-transform ${formOpen ? "rotate-45" : ""}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span>{formOpen ? "Tutup" : "Tambah Tanggal"}</span>
        </button>
      </div>

      {formOpen ? (
        <form
          onSubmit={addCustomDate}
          className="mt-4 space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5"
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="off-day-date"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Tanggal (WIB)
              </label>
              <input
                id="off-day-date"
                type="date"
                min={todayWib}
                required
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="font-mono-num mt-1 min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="off-day-note"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Catatan (opsional)
              </label>
              <input
                id="off-day-note"
                type="text"
                maxLength={160}
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder="Libur shift, Lepas jaga"
                className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busyKey !== null}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 text-xs font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            <CalendarOff className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>{busyKey === "custom" ? "Menyimpan..." : "Simpan Tanggal Libur"}</span>
          </button>
        </form>
      ) : null}

      {feedback ? (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
            feedback.type === "error"
              ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
              : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      <div className="mt-4">
        {upcomingOffDays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-3 text-xs text-[var(--ink-muted)]">
            Gunakan tombol pintas di atas untuk liburkan hari ini/besok, atau klik <strong>+ Tambah Tanggal</strong>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {upcomingOffDays.map((item) => (
              <div
                key={item.date}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--off-border)] bg-[var(--off-bg)] py-1 pr-1 pl-2.5 text-xs font-semibold text-[var(--off-fg)]"
              >
                <span className="truncate">
                  {formatWibDateCompactIndonesian(item.date)}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void removeDate(item.date)}
                  aria-label={`Hapus libur ${formatWibDateCompactIndonesian(item.date)}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/15 dark:hover:bg-white/15 disabled:opacity-40 sm:h-7 sm:w-7"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
