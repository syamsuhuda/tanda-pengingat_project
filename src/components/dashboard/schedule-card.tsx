"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock } from "lucide-react";
import { hmTimeToMinutes } from "@/lib/timezone";
import type { AttendanceScheduleConfig, AttendanceStage } from "@/lib/types";

interface ScheduleCardProps {
  schedule: AttendanceScheduleConfig;
  onChanged: () => Promise<void>;
}

const HALF_HOUR_OPTIONS: string[] = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

const STAGE_ROWS: Array<{
  stage: AttendanceStage;
  title: string;
  subtitle: string;
}> = [
  {
    stage: "morning",
    title: "Pengingat Pagi + Kalender .ics",
    subtitle: "Slot kalender 30 menit otomatis mengikuti jam ini.",
  },
  {
    stage: "afternoon",
    title: "Pengecekan Sore",
    subtitle: "Hanya terkirim bila absen hari ini belum dikonfirmasi.",
  },
  {
    stage: "urgent",
    title: "Peringatan Urgent + Alert ke Email Saya",
    subtitle: "Mengirim peringatan ke pasangan dan eskalasi paralel ke email Anda.",
  },
];

function validateScheduleOrder(draft: {
  morning: { enabled: boolean; time: string };
  afternoon: { enabled: boolean; time: string };
  urgent: { enabled: boolean; time: string };
}): string | null {
  if (!draft.morning.enabled && !draft.afternoon.enabled && !draft.urgent.enabled) {
    return "Minimal satu tahap pengingat harus aktif.";
  }

  const m = hmTimeToMinutes(draft.morning.time);
  const a = hmTimeToMinutes(draft.afternoon.time);
  const u = hmTimeToMinutes(draft.urgent.time);

  if (draft.morning.enabled && draft.afternoon.enabled && m >= a) {
    return "Jam Pengingat Pagi harus lebih awal dari Pengecekan Sore.";
  }
  if (draft.afternoon.enabled && draft.urgent.enabled && a >= u) {
    return "Jam Pengecekan Sore harus lebih awal dari Peringatan Urgent.";
  }
  if (draft.morning.enabled && draft.urgent.enabled && m >= u) {
    return "Jam Pengingat Pagi harus lebih awal dari Peringatan Urgent.";
  }

  return null;
}

export function ScheduleCard({ schedule, onChanged }: ScheduleCardProps) {
  const [draft, setDraft] = useState({
    morning: { ...schedule.morning },
    afternoon: { ...schedule.afternoon },
    urgent: { ...schedule.urgent },
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraft({
      morning: { ...schedule.morning },
      afternoon: { ...schedule.afternoon },
      urgent: { ...schedule.urgent },
    });
  }, [
    schedule.morning.enabled,
    schedule.morning.time,
    schedule.afternoon.enabled,
    schedule.afternoon.time,
    schedule.urgent.enabled,
    schedule.urgent.time,
    schedule.updatedAt,
  ]);

  const validationError = useMemo(() => validateScheduleOrder(draft), [draft]);

  function updateStage(
    stage: AttendanceStage,
    patch: Partial<{ enabled: boolean; time: string }>,
  ) {
    setDraft((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], ...patch },
    }));
    if (feedback) setFeedback(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationError) return;

    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan pengaturan jadwal.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text: body.message ?? "Jadwal pengingat berhasil diperbarui.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan pengaturan jadwal.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="schedule-config-heading"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="schedule-config-heading"
            className="font-display text-xl font-semibold text-[var(--ink)]"
          >
            Pengaturan Jam Kirim Fleksibel
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            Pilih jam WIB kelipatan 30 menit (mengikuti interval pengecekan cron 30 menit).
          </p>
        </div>
        <Clock
          className="h-5 w-5 shrink-0 text-[var(--accent)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
        {STAGE_ROWS.map((row) => {
          const stageConfig = draft[row.stage];
          const options = HALF_HOUR_OPTIONS.includes(stageConfig.time)
            ? HALF_HOUR_OPTIONS
            : [stageConfig.time, ...HALF_HOUR_OPTIONS].sort();

          return (
            <div
              key={row.stage}
              className={`flex flex-col gap-3 rounded-lg border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                stageConfig.enabled
                  ? "border-[var(--border-subtle)] bg-[var(--bg)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-muted)] opacity-85"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">{row.title}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{row.subtitle}</p>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2.5 sm:justify-end">
                <label htmlFor={`schedule-time-${row.stage}`} className="sr-only">
                  Jam WIB untuk {row.title}
                </label>
                <select
                  id={`schedule-time-${row.stage}`}
                  value={stageConfig.time}
                  disabled={!stageConfig.enabled || saving}
                  onChange={(event) =>
                    updateStage(row.stage, { time: event.target.value })
                  }
                  className="font-mono-num min-h-[44px] rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  {options.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot} WIB
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  role="switch"
                  aria-checked={stageConfig.enabled}
                  aria-label={`Aktifkan atau nonaktifkan ${row.title}`}
                  disabled={saving}
                  onClick={() =>
                    updateStage(row.stage, { enabled: !stageConfig.enabled })
                  }
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
                    stageConfig.enabled
                      ? "border-[var(--accent)] bg-[var(--accent)]"
                      : "border-[var(--border-control)] bg-[var(--surface)]"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow-xs transition-transform ${
                      stageConfig.enabled ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}

        {validationError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-[var(--danger-fg)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{validationError}</span>
          </div>
        ) : null}

        {feedback ? (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
              feedback.type === "error"
                ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
            }`}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
        ) : null}

        <div className="pt-1">
          <button
            type="submit"
            disabled={saving || Boolean(validationError)}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Menyimpan Jadwal..." : "Simpan Jadwal"}
          </button>
        </div>
      </form>
    </section>
  );
}
