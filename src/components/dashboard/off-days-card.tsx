"use client";

import { useState } from "react";
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
  const [dateInput, setDateInput] = useState(tomorrowWib);
  const [noteInput, setNoteInput] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isTodayOff = upcomingOffDays.some((item) => item.date === todayWib);
  const isTomorrowOff = upcomingOffDays.some((item) => item.date === tomorrowWib);

  async function addDates(dates: string[], note?: string, actionKey = "add") {
    setBusyKey(actionKey);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/off-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates,
          note: note?.trim() || undefined,
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

      if (actionKey === "custom") {
        setNoteInput("");
      }
      setFeedback({
        type: "success",
        text: body.message ?? "Tanggal libur berhasil disimpan.",
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

  async function removeDate(dateWib: string, actionKey = dateWib) {
    setBusyKey(actionKey);
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

  function handleCustomSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dateInput) {
      setFeedback({ type: "error", text: "Pilih tanggal libur terlebih dahulu." });
      return;
    }
    void addDates([dateInput], noteInput, "custom");
  }

  return (
    <section
      aria-labelledby="off-days-heading"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="off-days-heading"
            className="font-display text-xl font-semibold text-[var(--ink)]"
          >
            Jadwal Libur Fleksibel
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Bot otomatis melewati seluruh pengingat pada tanggal libur shift / off-day.
          </p>
        </div>
        <CalendarOff
          className="h-5 w-5 shrink-0 text-[var(--accent)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busyKey !== null}
          onClick={() =>
            isTodayOff
              ? void removeDate(todayWib, "quick-today")
              : void addDates([todayWib], "Libur hari ini", "quick-today")
          }
          className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
            isTodayOff
              ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
              : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          <CalendarOff className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            {busyKey === "quick-today"
              ? "Menyimpan..."
              : isTodayOff
                ? "Batalkan Libur Hari Ini"
                : "Liburkan Hari Ini"}
          </span>
        </button>

        <button
          type="button"
          disabled={busyKey !== null}
          onClick={() =>
            isTomorrowOff
              ? void removeDate(tomorrowWib, "quick-tomorrow")
              : void addDates([tomorrowWib], "Libur besok", "quick-tomorrow")
          }
          className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
            isTomorrowOff
              ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
              : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
          }`}
        >
          <CalendarOff className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            {busyKey === "quick-tomorrow"
              ? "Menyimpan..."
              : isTomorrowOff
                ? "Batalkan Libur Besok"
                : "Liburkan Besok"}
          </span>
        </button>
      </div>

      <form onSubmit={handleCustomSubmit} className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="off-day-date"
              className="block text-xs font-semibold text-[var(--ink)]"
            >
              Tanggal Libur (WIB)
            </label>
            <input
              id="off-day-date"
              type="date"
              min={todayWib}
              required
              value={dateInput}
              onChange={(event) => setDateInput(event.target.value)}
              className="font-mono-num mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
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
              placeholder="Libur shift, Lepas jaga malam"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busyKey !== null}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-muted)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>{busyKey === "custom" ? "Menambahkan..." : "Tambah Tanggal Libur"}</span>
        </button>
      </form>

      {feedback ? (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            feedback.type === "error"
              ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
              : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[var(--ink-muted)]">
            Tanggal Libur Mendatang
          </h3>
          <span className="font-mono-num text-xs text-[var(--ink-muted)]">
            {upcomingOffDays.length} hari
          </span>
        </div>

        {upcomingOffDays.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3.5 py-3 text-xs text-[var(--ink-muted)]">
            Belum ada tanggal libur terjadwal. Gunakan tombol cepat di atas atau tambah tanggal shift libur.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {upcomingOffDays.map((item) => (
              <li
                key={item.date}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg)] py-1.5 pr-1.5 pl-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--ink)]">
                    {formatWibDateCompactIndonesian(item.date)}
                  </span>
                  {item.note ? (
                    <span className="text-[var(--ink-muted)]"> &middot; {item.note}</span>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void removeDate(item.date)}
                  aria-label={`Hapus libur ${formatWibDateCompactIndonesian(item.date)}`}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)] disabled:opacity-40"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
