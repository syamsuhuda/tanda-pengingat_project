"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock, Mail, UserRound } from "lucide-react";
import { hmTimeToMinutes } from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
  AttendanceScheduleConfig,
  AttendanceStage,
} from "@/lib/types";

interface BotSettingsCardProps {
  recipient: ActiveRecipientConfig;
  schedule: AttendanceScheduleConfig;
  onRecipientUpdated: (next: ActiveRecipientConfig) => Promise<void>;
  onScheduleChanged: () => Promise<void>;
}

type SettingsSubTab = "recipient" | "schedule";

const HALF_HOUR_OPTIONS: string[] = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

const STAGE_ROWS: Array<{ stage: AttendanceStage; title: string }> = [
  { stage: "morning", title: "Pagi + Kalender .ics" },
  { stage: "afternoon", title: "Cek Sore" },
  { stage: "urgent", title: "Urgent + Eskalasi" },
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
    return "Jam Pagi harus lebih awal dari jam Sore.";
  }
  if (draft.afternoon.enabled && draft.urgent.enabled && a >= u) {
    return "Jam Sore harus lebih awal dari jam Urgent.";
  }
  if (draft.morning.enabled && draft.urgent.enabled && m >= u) {
    return "Jam Pagi harus lebih awal dari jam Urgent.";
  }

  return null;
}

export function BotSettingsCard({
  recipient,
  schedule,
  onRecipientUpdated,
  onScheduleChanged,
}: BotSettingsCardProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>("recipient");

  const [name, setName] = useState(recipient.name);
  const [email, setEmail] = useState(recipient.email);
  const [recipientDirty, setRecipientDirty] = useState(false);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [recipientFeedback, setRecipientFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [scheduleDraft, setScheduleDraft] = useState({
    morning: { ...schedule.morning },
    afternoon: { ...schedule.afternoon },
    urgent: { ...schedule.urgent },
  });
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!recipientDirty) {
      setName(recipient.name);
      setEmail(recipient.email);
    }
  }, [recipient.name, recipient.email, recipientDirty]);

  useEffect(() => {
    if (!scheduleDirty) {
      setScheduleDraft({
        morning: { ...schedule.morning },
        afternoon: { ...schedule.afternoon },
        urgent: { ...schedule.urgent },
      });
    }
  }, [
    schedule.morning.enabled,
    schedule.morning.time,
    schedule.afternoon.enabled,
    schedule.afternoon.time,
    schedule.urgent.enabled,
    schedule.urgent.time,
    schedule.updatedAt,
    scheduleDirty,
  ]);

  const scheduleValidationError = useMemo(
    () => validateScheduleOrder(scheduleDraft),
    [scheduleDraft],
  );

  async function handleSaveRecipient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRecipient(true);
    setRecipientFeedback(null);

    try {
      const response = await fetch("/api/attendance/recipient", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: ActiveRecipientConfig;
      };

      if (!response.ok || !body.ok || !body.data) {
        setRecipientFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan penerima aktif.",
        });
        return;
      }

      setRecipientDirty(false);
      setRecipientFeedback({
        type: "success",
        text: body.message ?? "Data penerima diperbarui!",
      });
      await onRecipientUpdated(body.data);
    } catch {
      setRecipientFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan penerima.",
      });
    } finally {
      setSavingRecipient(false);
    }
  }

  async function handleSaveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scheduleValidationError) return;

    setSavingSchedule(true);
    setScheduleFeedback(null);

    try {
      const response = await fetch("/api/attendance/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleDraft),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setScheduleFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan jadwal.",
        });
        return;
      }

      setScheduleDirty(false);
      setScheduleFeedback({
        type: "success",
        text: body.message ?? "Jadwal kirim diperbarui!",
      });
      await onScheduleChanged();
    } catch {
      setScheduleFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan jadwal.",
      });
    } finally {
      setSavingSchedule(false);
    }
  }

  return (
    <section
      aria-labelledby="bot-settings-heading"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="bot-settings-heading"
          className="font-display text-lg font-semibold text-[var(--ink)] sm:text-xl"
        >
          Pengaturan Bot
        </h2>

        <div
          role="tablist"
          aria-label="Sub-tab pengaturan bot"
          className="grid grid-cols-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "recipient"}
            onClick={() => setSubTab("recipient")}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all ${
              subTab === "recipient"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <UserRound className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Penerima</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === "schedule"}
            onClick={() => setSubTab("schedule")}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all ${
              subTab === "schedule"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Jam Kirim</span>
          </button>
        </div>
      </div>

      {subTab === "recipient" ? (
        <form onSubmit={handleSaveRecipient} className="mt-4 space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-recipient-name"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Nama Pasangan
              </label>
              <input
                id="settings-recipient-name"
                type="text"
                required
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setRecipientDirty(true);
                  if (recipientFeedback) setRecipientFeedback(null);
                }}
                placeholder="Nama panggilan"
                className="mt-1 min-h-[44px] w-full rounded-2xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)]"
              />
            </div>

            <div>
              <label
                htmlFor="settings-recipient-email"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Email Pasangan
              </label>
              <input
                id="settings-recipient-email"
                type="email"
                required
                maxLength={160}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setRecipientDirty(true);
                  if (recipientFeedback) setRecipientFeedback(null);
                }}
                placeholder="nama@email.com"
                className="mt-1 min-h-[44px] w-full rounded-2xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)]"
              />
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
            <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
            <span>
              Sapaan di email: <strong className="text-[var(--ink)]">Pagi, {name.trim() || "Nama"}!</strong> (otomatis sinkron ke Date Itinerary)
            </span>
          </p>

          {recipientFeedback ? (
            <div
              role={recipientFeedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-medium ${
                recipientFeedback.type === "error"
                  ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                  : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
              }`}
            >
              {recipientFeedback.type === "error" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{recipientFeedback.text}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={savingRecipient}
            className="btn-playful-gradient inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 sm:w-auto"
          >
            {savingRecipient ? "Menyimpan..." : "Simpan Penerima"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSaveSchedule} className="mt-4 space-y-2.5" noValidate>
          {STAGE_ROWS.map((row) => {
            const cfg = scheduleDraft[row.stage];
            const options = HALF_HOUR_OPTIONS.includes(cfg.time)
              ? HALF_HOUR_OPTIONS
              : [cfg.time, ...HALF_HOUR_OPTIONS].sort();

            return (
              <div
                key={row.stage}
                className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors ${
                  cfg.enabled
                    ? "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-muted)] opacity-75"
                }`}
              >
                <span className="text-xs font-semibold text-[var(--ink)] sm:text-sm">
                  {row.title}
                </span>

                <div className="flex shrink-0 items-center gap-2">
                  <label htmlFor={`settings-time-${row.stage}`} className="sr-only">
                    Jam WIB untuk {row.title}
                  </label>
                  <select
                    id={`settings-time-${row.stage}`}
                    value={cfg.time}
                    disabled={!cfg.enabled || savingSchedule}
                    onChange={(event) => {
                      setScheduleDraft((prev) => ({
                        ...prev,
                        [row.stage]: { ...prev[row.stage], time: event.target.value },
                      }));
                      setScheduleDirty(true);
                      if (scheduleFeedback) setScheduleFeedback(null);
                    }}
                    className="font-mono-num min-h-[40px] rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
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
                    aria-checked={cfg.enabled}
                    aria-label={`Aktifkan ${row.title}`}
                    disabled={savingSchedule}
                    onClick={() => {
                      setScheduleDraft((prev) => ({
                        ...prev,
                        [row.stage]: { ...prev[row.stage], enabled: !cfg.enabled },
                      }));
                      setScheduleDirty(true);
                      if (scheduleFeedback) setScheduleFeedback(null);
                    }}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
                      cfg.enabled
                        ? "border-transparent bg-[var(--accent)]"
                        : "border-[var(--border-control)] bg-[var(--surface)]"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                        cfg.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-[var(--ink-muted)]">
            Interval 30 menit mengikuti cron otomatis. Urutan wajib Pagi &lt; Sore &lt; Urgent.
          </p>

          {scheduleValidationError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger-fg)]"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span>{scheduleValidationError}</span>
            </div>
          ) : null}

          {scheduleFeedback ? (
            <div
              role={scheduleFeedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs font-medium ${
                scheduleFeedback.type === "error"
                  ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                  : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
              }`}
            >
              {scheduleFeedback.type === "error" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{scheduleFeedback.text}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={savingSchedule || Boolean(scheduleValidationError)}
            className="btn-playful-gradient inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 sm:w-auto"
          >
            {savingSchedule ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        </form>
      )}
    </section>
  );
}
