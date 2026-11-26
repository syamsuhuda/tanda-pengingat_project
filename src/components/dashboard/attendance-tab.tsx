"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Ban,
  BellOff,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  PauseCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomMessageCard } from "@/components/dashboard/custom-message-card";
import { OffDaysCard } from "@/components/dashboard/off-days-card";
import { RecipientCard } from "@/components/dashboard/recipient-card";
import { ScheduleCard } from "@/components/dashboard/schedule-card";
import { formatHmTimeWibLabel, formatIsoToWibDateTime, formatIsoToWibTime } from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
  ActivityLogEntry,
  DashboardStatusData,
  TimelineStageStatus,
} from "@/lib/types";

interface AttendanceTabProps {
  data: DashboardStatusData;
  onRefresh: () => Promise<void>;
  onRecipientUpdated: (next: ActiveRecipientConfig) => Promise<void>;
}

const TIMELINE_META: Record<
  TimelineStageStatus,
  { label: string; className: string }
> = {
  sent: {
    label: "Terkirim",
    className:
      "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]",
  },
  waiting: {
    label: "Menunggu",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink)]",
  },
  cancelled: {
    label: "Dibatalkan",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]",
  },
  paused: {
    label: "Dijeda",
    className:
      "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  },
  off_day: {
    label: "Libur",
    className:
      "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  },
  disabled: {
    label: "Nonaktif",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]",
  },
};

const LOG_RESULT_META: Record<
  ActivityLogEntry["result"],
  { label: string; className: string }
> = {
  success: {
    label: "Berhasil",
    className: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  },
  skipped: {
    label: "Dilewati",
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

export function AttendanceTab({
  data,
  onRefresh,
  onRecipientUpdated,
}: AttendanceTabProps) {
  const [manualNote, setManualNote] = useState(data.customMessage?.message ?? "");
  const [manualNoteTouched, setManualNoteTouched] = useState(false);
  const [includeIcs, setIncludeIcs] = useState(true);
  const [sendingManual, setSendingManual] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [forceDialogOpen, setForceDialogOpen] = useState(false);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [clearSentLocks, setClearSentLocks] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingManual, setConfirmingManual] = useState(false);
  const [cancellingTodayOff, setCancellingTodayOff] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [pauseDraft, setPauseDraft] = useState(data.pauseConfig.paused);
  const [pauseNote, setPauseNote] = useState(data.pauseConfig.note ?? "");
  const [pauseNoteDirty, setPauseNoteDirty] = useState(false);
  const [savingPause, setSavingPause] = useState(false);
  const [pauseFeedback, setPauseFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setPauseDraft(data.pauseConfig.paused);
    if (!pauseNoteDirty) {
      setPauseNote(data.pauseConfig.note ?? "");
    }
  }, [data.pauseConfig.paused, data.pauseConfig.note, pauseNoteDirty]);

  useEffect(() => {
    if (!manualNoteTouched) {
      setManualNote(data.customMessage?.message ?? "");
    }
  }, [data.customMessage?.message, manualNoteTouched]);

  const isConfirmed = data.attendance !== null;
  const isTodayOff = data.todayOffDay.isOff;
  const activeStageTimesText = (["morning", "afternoon", "urgent"] as const)
    .filter((stage) => data.schedule[stage].enabled)
    .map((stage) => formatHmTimeWibLabel(data.schedule[stage].time))
    .join(", ");

  async function executeManualTrigger(forceSend: boolean) {
    setSendingManual(true);
    setManualFeedback(null);

    try {
      const response = await fetch("/api/attendance/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customNote: manualNote.trim() || undefined,
          useActiveMessage: false,
          includeIcs,
          forceSend,
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
      };

      if (response.status === 409 && body.error === "ALREADY_CONFIRMED") {
        setForceDialogOpen(true);
        setSendingManual(false);
        return;
      }

      if (!response.ok || !body.ok) {
        setManualFeedback({
          type: "error",
          text: body.message ?? "Gagal mengirim pengingat manual.",
        });
        setSendingManual(false);
        return;
      }

      setForceDialogOpen(false);
      setManualFeedback({
        type: "success",
        text: body.message ?? "Pengingat manual berhasil dikirim.",
      });
      await onRefresh();
    } catch {
      setManualFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim pengingat manual.",
      });
    } finally {
      setSendingManual(false);
    }
  }

  function handleTriggerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfirmed) {
      setForceDialogOpen(true);
      return;
    }
    void executeManualTrigger(false);
  }

  async function handleManualConfirmToday() {
    setConfirmingManual(true);
    setStatusFeedback(null);

    try {
      const response = await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true, date: data.todayWib }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal mencatat konfirmasi manual.",
        });
        return;
      }

      setStatusFeedback({
        type: "success",
        text: body.message ?? "Absen hari ini berhasil dikonfirmasi manual.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan konfirmasi manual.",
      });
    } finally {
      setConfirmingManual(false);
    }
  }

  async function handleCancelTodayOffDay() {
    setCancellingTodayOff(true);
    setStatusFeedback(null);

    try {
      const response = await fetch(
        `/api/attendance/off-days?date=${encodeURIComponent(data.todayWib)}`,
        { method: "DELETE" },
      );

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal membatalkan libur hari ini.",
        });
        return;
      }

      setStatusFeedback({
        type: "success",
        text: body.message ?? "Status libur hari ini dibatalkan.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat membatalkan libur hari ini.",
      });
    } finally {
      setCancellingTodayOff(false);
    }
  }

  async function handleConfirmReset() {
    setResetting(true);
    setStatusFeedback(null);

    try {
      const response = await fetch("/api/attendance/reset", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearSentLocks }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal mereset status absen.",
        });
        return;
      }

      setResetDialogOpen(false);
      setClearSentLocks(false);
      setStatusFeedback({
        type: "success",
        text: body.message ?? "Status absen hari ini berhasil direset.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat mereset status hari ini.",
      });
    } finally {
      setResetting(false);
    }
  }

  async function savePauseConfig(nextPaused: boolean, nextNote: string) {
    setSavingPause(true);
    setPauseFeedback(null);

    try {
      const response = await fetch("/api/attendance/pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused: nextPaused,
          note: nextPaused ? nextNote.trim() || undefined : undefined,
        }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setPauseDraft(data.pauseConfig.paused);
        setPauseFeedback({
          type: "error",
          text: body.message ?? "Gagal memperbarui Mode Jeda Bot.",
        });
        return;
      }

      setPauseNoteDirty(false);
      setPauseFeedback({
        type: "success",
        text: body.message ?? "Pengaturan Mode Jeda Bot disimpan.",
      });
      await onRefresh();
    } catch {
      setPauseDraft(data.pauseConfig.paused);
      setPauseFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan Mode Jeda Bot.",
      });
    } finally {
      setSavingPause(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <section
            aria-labelledby="today-status-heading"
            className={`rounded-xl border bg-[var(--surface)] p-5 sm:p-7 ${
              isTodayOff && !isConfirmed
                ? "border-[var(--warning-border)]"
                : "border-[var(--border-subtle)]"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono-num text-xs font-medium text-[var(--ink-muted)]">
                  Status Absen Hari Ini &middot; {data.todayFormatted}
                </p>
                <div className="mt-2.5 flex items-center gap-3">
                  {isConfirmed ? (
                    <CheckCircle2
                      className="h-8 w-8 shrink-0 text-[var(--success-fg)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : isTodayOff ? (
                    <CalendarOff
                      className="h-8 w-8 shrink-0 text-[var(--warning-fg)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : (
                    <Clock
                      className="h-8 w-8 shrink-0 text-[var(--accent)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  )}
                  <h1
                    id="today-status-heading"
                    className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl"
                  >
                    {isConfirmed
                      ? "Sudah Absen"
                      : isTodayOff
                        ? "Hari Ini Libur (Bot Tidak Mengirim)"
                        : "Belum Absen"}
                  </h1>
                </div>
              </div>

              <span
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  isConfirmed
                    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                    : isTodayOff
                      ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink)]"
                }`}
              >
                Penerima: {data.recipient.name}
              </span>
            </div>

            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                isTodayOff && !isConfirmed
                  ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]"
              }`}
            >
              {data.attendance ? (
                <p className="text-[var(--ink)]">
                  Dikonfirmasi pukul{" "}
                  <strong className="font-mono-num">
                    {formatIsoToWibTime(data.attendance.confirmedAt)}
                  </strong>{" "}
                  (
                  {data.attendance.confirmedBy === "email_link"
                    ? "via tautan email"
                    : "via konfirmasi manual dashboard"}
                  ). Jadwal pengingat berikutnya hari ini otomatis dibatalkan.
                </p>
              ) : isTodayOff ? (
                <p>
                  Pengingat otomatis untuk{" "}
                  <strong className="font-mono-num">{data.todayWib}</strong> dilewati karena hari ini masuk daftar libur
                  {data.todayOffDay.note ? ` (${data.todayOffDay.note})` : ""}.
                </p>
              ) : (
                <p>
                  Belum ada konfirmasi untuk tanggal{" "}
                  <span className="font-mono-num font-medium text-[var(--ink)]">
                    {data.todayWib}
                  </span>
                  . Pengingat otomatis berjalan pada{" "}
                  <span className="font-mono-num font-medium text-[var(--ink)]">
                    {activeStageTimesText || "jadwal aktif"}
                  </span>{" "}
                  kecuali Mode Jeda atau Libur aktif.
                </p>
              )}
            </div>

            {statusFeedback ? (
              <div
                role={statusFeedback.type === "error" ? "alert" : "status"}
                className={`mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
                  statusFeedback.type === "error"
                    ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                    : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                }`}
              >
                {statusFeedback.type === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{statusFeedback.text}</span>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {isTodayOff && !isConfirmed ? (
                <button
                  type="button"
                  onClick={() => void handleCancelTodayOffDay()}
                  disabled={cancellingTodayOff}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
                >
                  <CalendarOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>
                    {cancellingTodayOff ? "Membatalkan..." : "Batalkan Libur Hari Ini"}
                  </span>
                </button>
              ) : null}

              {!isConfirmed ? (
                <button
                  type="button"
                  onClick={() => void handleManualConfirmToday()}
                  disabled={confirmingManual}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    isTodayOff
                      ? "border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                      : "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>{confirmingManual ? "Menyimpan..." : "Tandai Sudah Absen"}</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Reset Status Hari Ini</span>
              </button>
            </div>
          </section>

          <section
            aria-labelledby="timeline-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id="timeline-heading"
                className="font-display text-xl font-semibold text-[var(--ink)]"
              >
                Lini Masa Pengingat Hari Ini
              </h2>
              <span className="font-mono-num text-xs text-[var(--ink-muted)]">
                Senin - Minggu
              </span>
            </div>

            <ol className="mt-4 divide-y divide-[var(--border-subtle)]">
              {data.timeline.map((item) => {
                const badge = TIMELINE_META[item.status];
                return (
                  <li
                    key={item.stage}
                    className="flex flex-col gap-2 py-3.5 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono-num mt-0.5 inline-block min-w-[78px] text-sm font-semibold text-[var(--ink)]">
                        {item.scheduledTimeWib}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">{item.label}</p>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {item.sentAt
                            ? `Terkirim pada ${formatIsoToWibTime(item.sentAt)}`
                            : item.stage === "morning"
                              ? "Email + undangan kalender (.ics, alarm 15 menit)"
                              : item.stage === "afternoon"
                                ? "Tautan konfirmasi tanpa duplikat .ics"
                                : "Email urgent ke pasangan + eskalasi paralel ke email Anda"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                    >
                      {item.status === "sent" ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : item.status === "paused" ? (
                        <PauseCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : item.status === "off_day" ? (
                        <CalendarOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : item.status === "disabled" ? (
                        <BellOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : item.status === "cancelled" ? (
                        <Ban className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      )}
                      <span>{badge.label}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <ScheduleCard schedule={data.schedule} onChanged={onRefresh} />

          <CustomMessageCard
            customMessage={data.customMessage}
            recipientName={data.recipient.name}
            onChanged={onRefresh}
          />

          <section
            aria-labelledby="manual-send-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <h2
              id="manual-send-heading"
              className="font-display text-xl font-semibold text-[var(--ink)]"
            >
              Kirim Pengingat Sekarang
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Kirim email pengingat manual ke {data.recipient.name} ({data.recipient.email}) lengkap dengan tautan konfirmasi hari ini.
            </p>

            <form onSubmit={handleTriggerSubmit} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="manual-reminder-note"
                    className="block text-sm font-semibold text-[var(--ink)]"
                  >
                    Pesan / catatan untuk kiriman ini (opsional)
                  </label>
                  {manualNote ? (
                    <button
                      type="button"
                      onClick={() => {
                        setManualNote("");
                        setManualNoteTouched(true);
                      }}
                      className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
                    >
                      Kosongkan
                    </button>
                  ) : null}
                </div>
                <textarea
                  id="manual-reminder-note"
                  rows={3}
                  maxLength={500}
                  value={manualNote}
                  onChange={(event) => {
                    setManualNote(event.target.value);
                    setManualNoteTouched(true);
                  }}
                  placeholder="Contoh: Jangan lupa absen sebelum rapat jam 10.00 ya."
                  className="mt-1.5 w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                />
                {data.customMessage && !manualNoteTouched ? (
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Diisi otomatis dari pesan khusus aktif. Anda bebas mengedit atau mengosongkannya sebelum mengirim.
                  </p>
                ) : null}
              </div>

              <label
                htmlFor="manual-include-ics"
                className="flex min-h-[44px] items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
              >
                <input
                  id="manual-include-ics"
                  type="checkbox"
                  checked={includeIcs}
                  onChange={(event) => setIncludeIcs(event.target.checked)}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                <span>
                  Sertakan undangan kalender (.ics) dan tombol tambah manual Google Calendar
                </span>
              </label>

              {manualFeedback ? (
                <div
                  role={manualFeedback.type === "error" ? "alert" : "status"}
                  className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${
                    manualFeedback.type === "error"
                      ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                      : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                  }`}
                >
                  {manualFeedback.type === "error" ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  )}
                  <span>{manualFeedback.text}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={sendingManual}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60 sm:w-auto"
              >
                <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {sendingManual ? "Mengirim Pengingat..." : "Kirim Pengingat Sekarang"}
                </span>
              </button>
            </form>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <RecipientCard
            recipient={data.recipient}
            onUpdated={onRecipientUpdated}
          />

          <OffDaysCard
            todayWib={data.todayWib}
            tomorrowWib={data.tomorrowWib}
            upcomingOffDays={data.upcomingOffDays}
            onChanged={onRefresh}
          />

          <section
            aria-labelledby="pause-bot-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="pause-bot-heading"
                  className="font-display text-xl font-semibold text-[var(--ink)]"
                >
                  Mode Jeda Bot (Pause)
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Jeda menyeluruh untuk cuti panjang hingga Anda aktifkan kembali.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={pauseDraft}
                aria-label="Aktifkan atau matikan Mode Jeda Bot"
                disabled={savingPause}
                onClick={() => {
                  const next = !pauseDraft;
                  setPauseDraft(next);
                  void savePauseConfig(next, pauseNote);
                }}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
                  pauseDraft
                    ? "border-[var(--accent)] bg-[var(--accent)]"
                    : "border-[var(--border-control)] bg-[var(--surface-muted)]"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-white shadow-xs transition-transform ${
                    pauseDraft ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="pause-note-input"
                  className="block text-sm font-semibold text-[var(--ink)]"
                >
                  Catatan jeda (opsional)
                </label>
                <input
                  id="pause-note-input"
                  type="text"
                  maxLength={240}
                  value={pauseNote}
                  onChange={(event) => {
                    setPauseNote(event.target.value);
                    setPauseNoteDirty(true);
                  }}
                  placeholder="Contoh: Cuti bersama sampai Senin"
                  className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[var(--ink-muted)]">
                  Status saat ini:{" "}
                  <strong className="text-[var(--ink)]">
                    {data.pauseConfig.paused ? "Dijeda" : "Aktif berjalan"}
                  </strong>
                  {data.pauseConfig.updatedAt
                    ? ` (${formatIsoToWibDateTime(data.pauseConfig.updatedAt)})`
                    : ""}
                </span>

                <button
                  type="button"
                  disabled={savingPause}
                  onClick={() => void savePauseConfig(pauseDraft, pauseNote)}
                  className="min-h-[44px] rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
                >
                  {savingPause ? "Menyimpan..." : "Simpan Catatan"}
                </button>
              </div>

              {pauseFeedback ? (
                <p
                  role={pauseFeedback.type === "error" ? "alert" : "status"}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    pauseFeedback.type === "error"
                      ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                      : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                  }`}
                >
                  {pauseFeedback.text}
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="activity-logs-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id="activity-logs-heading"
                className="font-display text-xl font-semibold text-[var(--ink)]"
              >
                Log Aktivitas Terakhir
              </h2>
              <span className="font-mono-num text-xs text-[var(--ink-muted)]">
                {data.logs.length} entri
              </span>
            </div>

            {data.logs.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5 text-sm text-[var(--ink-muted)]">
                Belum ada log aktivitas tercatat. Riwayat cron harian, konfirmasi absen, dan pengiriman itinerary akan tampil di sini.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
                {data.logs.map((entry) => {
                  const badge = LOG_RESULT_META[entry.result];
                  return (
                    <li key={entry.id} className="py-3 first:pt-1 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-num text-[11px] text-[var(--ink-muted)]">
                          {formatIsoToWibDateTime(entry.timestamp)}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-snug text-[var(--ink)]">
                        {entry.summary}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={resetDialogOpen}
        title="Reset Status Absen Hari Ini?"
        description={`Status konfirmasi untuk tanggal ${data.todayWib} akan dikembalikan ke Belum Absen. Pengingat terjadwal berikutnya di hari yang sama akan kembali aktif.`}
        confirmLabel="Ya, Reset Status"
        tone="danger"
        busy={resetting}
        extraContent={
          <label
            htmlFor="reset-clear-locks"
            className="flex min-h-[44px] items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-[var(--ink)]"
          >
            <input
              id="reset-clear-locks"
              type="checkbox"
              checked={clearSentLocks}
              onChange={(event) => setClearSentLocks(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              Hapus juga penanda tahap terkirim hari ini ({activeStageTimesText || "semua tahap"}) agar tahap yang sama dapat dikirim ulang oleh cron.
            </span>
          </label>
        }
        onConfirm={() => void handleConfirmReset()}
        onCancel={() => {
          setResetDialogOpen(false);
          setClearSentLocks(false);
        }}
      />

      <ConfirmDialog
        open={forceDialogOpen}
        title="Absen Hari Ini Sudah Tercatat"
        description={`Status absen tanggal ${data.todayWib} sudah terkonfirmasi. Apakah Anda tetap ingin mengirim email pengingat manual sekarang?`}
        confirmLabel="Tetap Kirim Pengingat"
        tone="accent"
        busy={sendingManual}
        onConfirm={() => void executeManualTrigger(true)}
        onCancel={() => setForceDialogOpen(false)}
      />
    </div>
  );
}
