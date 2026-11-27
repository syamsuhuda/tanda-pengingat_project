"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Mail,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { TimePicker24h } from "@/components/ui/time-picker-24h";
import { hmTimeToMinutes } from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
  AttendanceScheduleConfig,
  AttendanceStage,
  CronHealthSummary,
} from "@/lib/types";

interface BotSettingsCardProps {
  recipient: ActiveRecipientConfig;
  senderName: string;
  schedule: AttendanceScheduleConfig;
  cronHealth?: CronHealthSummary;
  checkingNow?: boolean;
  onCheckNow?: () => Promise<void>;
  onOpenCronGuide?: () => void;
  onRecipientUpdated: (next: ActiveRecipientConfig) => Promise<void>;
  onConfigChanged: () => Promise<void>;
}

type SettingsSubTab = "recipient" | "schedule";

const STAGE_ROWS: Array<{ stage: AttendanceStage; title: string }> = [
  { stage: "morning", title: "Pagi + Kalender" },
  { stage: "afternoon", title: "Cek Siang / Sore" },
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
  senderName,
  schedule,
  cronHealth,
  checkingNow = false,
  onCheckNow,
  onOpenCronGuide,
  onRecipientUpdated,
  onConfigChanged,
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

  const [senderDraft, setSenderDraft] = useState(senderName);
  const [senderDirty, setSenderDirty] = useState(false);
  const [savingSender, setSavingSender] = useState(false);
  const [senderFeedback, setSenderFeedback] = useState<{
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
    if (!senderDirty) {
      setSenderDraft(senderName);
    }
  }, [senderName, senderDirty]);

  useEffect(() => {
    if (!scheduleDirty) {
      setScheduleDraft({
        morning: { enabled: schedule.morning.enabled, time: schedule.morning.time },
        afternoon: { enabled: schedule.afternoon.enabled, time: schedule.afternoon.time },
        urgent: { enabled: schedule.urgent.enabled, time: schedule.urgent.time },
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
        text: body.message ?? "Data penerima diperbarui.",
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
        text: body.message ?? "Jadwal kirim diperbarui.",
      });
      await onConfigChanged();
    } catch {
      setScheduleFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan jadwal.",
      });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleSaveSender(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSender(true);
    setSenderFeedback(null);

    try {
      const response = await fetch("/api/attendance/sender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: senderDraft.trim() }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setSenderFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan nama pengirim default.",
        });
        return;
      }

      setSenderDirty(false);
      setSenderFeedback({
        type: "success",
        text: body.message ?? "Nama pengirim default diperbarui.",
      });
      await onConfigChanged();
    } catch {
      setSenderFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan nama pengirim.",
      });
    } finally {
      setSavingSender(false);
    }
  }

  return (
    <section
      aria-labelledby="bot-settings-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="bot-settings-heading"
          className="font-display text-lg font-semibold text-[var(--ink)]"
        >
          Pengaturan Bot
        </h2>

        <div
          role="tablist"
          aria-label="Sub-tab pengaturan bot"
          className="grid w-full grid-cols-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1 sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "recipient"}
            onClick={() => setSubTab("recipient")}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:min-h-[36px] sm:px-3 ${
              subTab === "recipient"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <UserRound className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">Penerima</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === "schedule"}
            onClick={() => setSubTab("schedule")}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:min-h-[36px] sm:px-3 ${
              subTab === "schedule"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">Jam Kirim</span>
          </button>
        </div>
      </div>

      {subTab === "recipient" ? (
        <div className="mt-4 space-y-5">
          <form onSubmit={handleSaveRecipient} className="space-y-3" noValidate>
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
                  className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
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
                  className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
                />
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span>
                Sapaan email: <strong className="text-[var(--ink)]">Pagi, {name.trim() || "Nama"}!</strong> (sinkron ke Date Itinerary)
              </span>
            </p>

            {recipientFeedback ? (
              <div
                role={recipientFeedback.type === "error" ? "alert" : "status"}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
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
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60 sm:w-auto"
            >
              {savingRecipient ? "Menyimpan..." : "Simpan Penerima"}
            </button>
          </form>

          <form
            onSubmit={handleSaveSender}
            className="space-y-3 border-t border-[var(--border-subtle)] pt-4"
            noValidate
          >
            <div>
              <label
                htmlFor="settings-sender-name"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Nama Pengirim Default (tampil di Gmail &amp; Google Calendar)
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  id="settings-sender-name"
                  type="text"
                  required
                  maxLength={60}
                  value={senderDraft}
                  onChange={(event) => {
                    setSenderDraft(event.target.value);
                    setSenderDirty(true);
                    if (senderFeedback) setSenderFeedback(null);
                  }}
                  placeholder="Nama pengirim email"
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={savingSender}
                  className="min-h-[44px] shrink-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
                >
                  {savingSender ? "Menyimpan..." : "Simpan Pengirim"}
                </button>
              </div>
            </div>

            {senderFeedback ? (
              <div
                role={senderFeedback.type === "error" ? "alert" : "status"}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                  senderFeedback.type === "error"
                    ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                    : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                }`}
              >
                {senderFeedback.type === "error" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                )}
                <span>{senderFeedback.text}</span>
              </div>
            ) : null}
          </form>
        </div>
      ) : subTab === "schedule" ? (
        <form onSubmit={handleSaveSchedule} className="mt-4 space-y-2.5" noValidate>
          {STAGE_ROWS.map((row) => {
            const cfg = scheduleDraft[row.stage];

            return (
              <div
                key={row.stage}
                className={`flex flex-col gap-2.5 rounded-xl border p-3.5 transition-colors ${
                  cfg.enabled
                    ? "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-muted)] opacity-80"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-semibold text-[var(--ink)] sm:text-sm">
                      {row.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        cfg.enabled
                          ? "bg-[var(--success-bg)] text-[var(--success-fg)]"
                          : "bg-[var(--surface)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {cfg.enabled ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

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

                <div className="w-full min-w-0">
                  <label htmlFor={`settings-time-${row.stage}`} className="sr-only">
                    Jam WIB untuk {row.title}
                  </label>
                  <TimePicker24h
                    id={`settings-time-${row.stage}`}
                    value={cfg.time}
                    disabled={!cfg.enabled || savingSchedule}
                    onChange={(nextHm) => {
                      setScheduleDraft((prev) => ({
                        ...prev,
                        [row.stage]: { ...prev[row.stage], time: nextHm },
                      }));
                      setScheduleDirty(true);
                      if (scheduleFeedback) setScheduleFeedback(null);
                    }}
                    ariaLabel={`Jam ${row.title}`}
                    className="w-full min-w-0"
                  />
                </div>
              </div>
            );
          })}

          <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
            Ketik langsung format 24 jam (<span className="font-mono-num">00:00</span>-<span className="font-mono-num">23:59</span> WIB) atau klik ikon jam. Untuk presisi per menit, gunakan interval cron 1-5 menit di <span className="font-semibold text-[var(--ink)]">cron-job.org</span>. Urutan wajib Pagi &lt; Sore &lt; Urgent.
          </p>

          {scheduleValidationError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger-fg)]"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              <span>{scheduleValidationError}</span>
            </div>
          ) : null}

          {scheduleFeedback ? (
            <div
              role={scheduleFeedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
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
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-50 sm:w-auto"
          >
            {savingSchedule ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        </form>
      ) : null}

      {cronHealth ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-[11px]">
          <div className="flex min-w-0 items-center gap-1.5 text-[var(--ink-muted)]">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                cronHealth.status === "healthy"
                  ? "bg-emerald-500"
                  : cronHealth.status === "delayed"
                    ? "bg-amber-400"
                    : "bg-slate-400"
              }`}
              aria-hidden="true"
            />
            <span className="truncate">
              {cronHealth.status === "healthy"
                ? `Scheduler aktif${cronHealth.source ? ` · ${cronHealth.source}` : ""} · ${
                    cronHealth.minutesSinceLastPing === 0
                      ? "baru saja"
                      : `${cronHealth.minutesSinceLastPing} mnt lalu`
                  }`
                : cronHealth.status === "delayed"
                  ? `Scheduler tertunda (${cronHealth.minutesSinceLastPing} mnt lalu)`
                  : "Scheduler belum terhubung"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {onCheckNow ? (
              <button
                type="button"
                disabled={checkingNow}
                onClick={() => void onCheckNow()}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface-elevated)] px-2.5 text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${checkingNow ? "animate-spin" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>{checkingNow ? "Mengecek..." : "Cek"}</span>
              </button>
            ) : null}
            {onOpenCronGuide ? (
              <button
                type="button"
                onClick={onOpenCronGuide}
                className="inline-flex min-h-[34px] items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Panduan Cron
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
