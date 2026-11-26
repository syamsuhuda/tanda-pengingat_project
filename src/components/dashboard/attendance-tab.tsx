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
  PauseCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { BotSettingsCard } from "@/components/dashboard/bot-settings-card";
import { CustomMessageCard } from "@/components/dashboard/custom-message-card";
import { ManualTriggerModal } from "@/components/dashboard/manual-trigger-modal";
import { OffDaysCard } from "@/components/dashboard/off-days-card";
import { formatHmTimeWibLabel, formatIsoToWibTime } from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
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
      "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink-muted)]",
  },
  cancelled: {
    label: "Dibatalkan",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink-muted)]",
  },
  paused: {
    label: "Dijeda",
    className:
      "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  },
  off_day: {
    label: "Libur",
    className:
      "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]",
  },
  disabled: {
    label: "Nonaktif",
    className:
      "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]",
  },
};

export function AttendanceTab({
  data,
  onRefresh,
  onRecipientUpdated,
}: AttendanceTabProps) {
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [clearSentLocks, setClearSentLocks] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingManual, setConfirmingManual] = useState(false);
  const [quickOffBusy, setQuickOffBusy] = useState<"today" | "tomorrow" | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [pauseDraft, setPauseDraft] = useState(data.pauseConfig.paused);
  const [pauseNote, setPauseNote] = useState(data.pauseConfig.note ?? "");
  const [pauseNoteDirty, setPauseNoteDirty] = useState(false);
  const [savingPause, setSavingPause] = useState(false);
  const [pauseNoteExpanded, setPauseNoteExpanded] = useState(false);

  useEffect(() => {
    setPauseDraft(data.pauseConfig.paused);
    if (!pauseNoteDirty) {
      setPauseNote(data.pauseConfig.note ?? "");
    }
  }, [data.pauseConfig.paused, data.pauseConfig.note, pauseNoteDirty]);

  const isConfirmed = data.attendance !== null;
  const isTodayOff = data.todayOffDay.isOff;
  const isTomorrowOff = data.upcomingOffDays.some((item) => item.date === data.tomorrowWib);

  const activeStageTimesText = (["morning", "afternoon", "urgent"] as const)
    .filter((stage) => data.schedule[stage].enabled)
    .map((stage) => formatHmTimeWibLabel(data.schedule[stage].time))
    .join(", ");

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
        text: body.message ?? "Absen hari ini berhasil ditandai.",
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

  async function toggleQuickOffDay(target: "today" | "tomorrow") {
    const targetDate = target === "today" ? data.todayWib : data.tomorrowWib;
    const isCurrentlyOff = target === "today" ? isTodayOff : isTomorrowOff;

    setQuickOffBusy(target);
    setStatusFeedback(null);

    try {
      const response = isCurrentlyOff
        ? await fetch(`/api/attendance/off-days?date=${encodeURIComponent(targetDate)}`, {
            method: "DELETE",
          })
        : await fetch("/api/attendance/off-days", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dates: [targetDate],
              note: target === "today" ? "Libur hari ini" : "Libur besok",
            }),
          });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal memperbarui status libur.",
        });
        return;
      }

      setStatusFeedback({
        type: "success",
        text: body.message ?? "Status libur diperbarui.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat memperbarui tanggal libur.",
      });
    } finally {
      setQuickOffBusy(null);
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
        text: body.message ?? "Status absen hari ini direset.",
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
    setStatusFeedback(null);

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
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal memperbarui Mode Jeda Bot.",
        });
        return;
      }

      setPauseNoteDirty(false);
      setStatusFeedback({
        type: "success",
        text: body.message ?? "Mode Jeda Bot diperbarui.",
      });
      await onRefresh();
    } catch {
      setPauseDraft(data.pauseConfig.paused);
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan Mode Jeda Bot.",
      });
    } finally {
      setSavingPause(false);
    }
  }

  const heroBorderClass = isConfirmed
    ? "border-[var(--success-border)]"
    : isTodayOff
      ? "border-[var(--off-border)]"
      : "border-[var(--border-subtle)]";

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="today-status-heading"
        className={`rounded-2xl border bg-[var(--surface)] p-5 shadow-xs sm:p-6 ${heroBorderClass}`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-num rounded-md bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                {data.todayFormatted}
              </span>
              <span className="rounded-md bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">
                Untuk {data.recipient.name}
              </span>
              {pauseDraft ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--warning-fg)]">
                  <PauseCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  <span>Bot Dijeda</span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3.5 pt-1">
              {isConfirmed ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--success-bg)] text-[var(--success-fg)]">
                  <CheckCircle2 className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
                </div>
              ) : isTodayOff ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--off-bg)] text-[var(--off-fg)]">
                  <CalendarOff className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--warning-bg)] text-[var(--warning-fg)]">
                  <Clock className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
                </div>
              )}

              <div>
                <h1
                  id="today-status-heading"
                  className="font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl"
                >
                  {isConfirmed
                    ? "Sudah Absen"
                    : isTodayOff
                      ? "Hari Ini Libur"
                      : "Belum Absen"}
                </h1>
                <p className="text-xs leading-relaxed text-[var(--ink-muted)] sm:text-sm">
                  {data.attendance ? (
                    <>
                      Tercatat pukul{" "}
                      <strong className="font-mono-num text-[var(--ink)]">
                        {formatIsoToWibTime(data.attendance.confirmedAt)}
                      </strong>{" "}
                      ({data.attendance.confirmedBy === "email_link" ? "lewat tautan email" : "manual dashboard"}).
                    </>
                  ) : isTodayOff ? (
                    <>
                      Pengingat otomatis off hari ini{data.todayOffDay.note ? ` (${data.todayOffDay.note})` : ""}.
                    </>
                  ) : (
                    <>
                      Jadwal aktif:{" "}
                      <span className="font-mono-num font-medium text-[var(--ink)]">
                        {activeStageTimesText || "tidak ada"}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[460px]">
            {data.timeline.map((item) => {
              const badge = TIMELINE_META[item.status];
              return (
                <div
                  key={item.stage}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5 sm:flex-col sm:items-start sm:gap-1.5"
                >
                  <div>
                    <p className="font-mono-num text-xs font-bold text-[var(--ink)]">
                      {item.scheduledTimeWib}
                    </p>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      {item.stage === "morning"
                        ? "Pagi + Kalender"
                        : item.stage === "afternoon"
                          ? "Cek Sore"
                          : "Urgent + Alert"}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                  >
                    {item.status === "sent" ? (
                      <Check className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                    ) : item.status === "paused" ? (
                      <PauseCircle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    ) : item.status === "off_day" ? (
                      <CalendarOff className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    ) : item.status === "disabled" ? (
                      <BellOff className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    ) : item.status === "cancelled" ? (
                      <Ban className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <Clock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    )}
                    <span>{badge.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {statusFeedback ? (
          <div
            role={statusFeedback.type === "error" ? "alert" : "status"}
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
              statusFeedback.type === "error"
                ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
            }`}
          >
            {statusFeedback.type === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            )}
            <span>{statusFeedback.text}</span>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="btn-primary-accent inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors active:scale-[0.98]"
          >
            <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>Kirim Pengingat Sekarang</span>
          </button>

          {!isConfirmed ? (
            <button
              type="button"
              onClick={() => void handleManualConfirmToday()}
              disabled={confirmingManual}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] px-3.5 text-xs font-bold text-[var(--success-fg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>{confirmingManual ? "Menyimpan..." : "Tandai Sudah Absen"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setResetDialogOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Reset Status</span>
            </button>
          )}

          <button
            type="button"
            disabled={quickOffBusy !== null}
            onClick={() => void toggleQuickOffDay("today")}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 ${
              isTodayOff
                ? "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]"
                : "border-[var(--border-control)] bg-[var(--surface-elevated)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            <CalendarOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>
              {quickOffBusy === "today"
                ? "..."
                : isTodayOff
                  ? "Batalkan Libur Hari Ini"
                  : "Liburkan Hari Ini"}
            </span>
          </button>

          <button
            type="button"
            disabled={quickOffBusy !== null}
            onClick={() => void toggleQuickOffDay("tomorrow")}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 ${
              isTomorrowOff
                ? "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]"
                : "border-[var(--border-control)] bg-[var(--surface-elevated)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            <CalendarOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>
              {quickOffBusy === "tomorrow"
                ? "..."
                : isTomorrowOff
                  ? "Batalkan Libur Besok"
                  : "Liburkan Besok"}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-1.5 pr-2 pl-3">
            <button
              type="button"
              onClick={() => setPauseNoteExpanded((prev) => !prev)}
              className="text-xs font-semibold text-[var(--ink)] hover:underline"
            >
              Mode Jeda Bot
            </button>
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
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
                pauseDraft
                  ? "border-transparent bg-amber-500"
                  : "border-[var(--border-control)] bg-[var(--surface)]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                  pauseDraft ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {pauseNoteExpanded || pauseDraft ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 sm:flex-row sm:items-center">
            <label htmlFor="quick-pause-note" className="sr-only">
              Catatan jeda bot
            </label>
            <input
              id="quick-pause-note"
              type="text"
              maxLength={240}
              value={pauseNote}
              onChange={(event) => {
                setPauseNote(event.target.value);
                setPauseNoteDirty(true);
              }}
              placeholder="Catatan jeda opsional (mis. Cuti sampai Senin)"
              className="min-h-[40px] flex-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
            />
            <button
              type="button"
              disabled={savingPause}
              onClick={() => void savePauseConfig(pauseDraft, pauseNote)}
              className="min-h-[40px] shrink-0 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              {savingPause ? "Menyimpan..." : "Simpan Catatan"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-5 lg:col-span-6">
          <CustomMessageCard
            customMessage={data.customMessage}
            recipientName={data.recipient.name}
            onChanged={onRefresh}
          />

          <OffDaysCard
            todayWib={data.todayWib}
            tomorrowWib={data.tomorrowWib}
            upcomingOffDays={data.upcomingOffDays}
            onChanged={onRefresh}
          />
        </div>

        <div className="space-y-5 lg:col-span-6">
          <BotSettingsCard
            recipient={data.recipient}
            schedule={data.schedule}
            onRecipientUpdated={onRecipientUpdated}
            onScheduleChanged={onRefresh}
          />

          <ActivityLogsCard logs={data.logs} />
        </div>
      </div>

      <ManualTriggerModal
        open={manualModalOpen}
        todayWib={data.todayWib}
        recipientName={data.recipient.name}
        recipientEmail={data.recipient.email}
        isAlreadyConfirmed={isConfirmed}
        activeCustomMessage={data.customMessage?.message ?? null}
        onClose={() => setManualModalOpen(false)}
        onSent={onRefresh}
      />

      <ConfirmDialog
        open={resetDialogOpen}
        title="Reset Status Absen Hari Ini?"
        description={`Status konfirmasi untuk tanggal ${data.todayWib} akan dikembalikan ke Belum Absen. Pengingat terjadwal berikutnya hari ini akan kembali aktif.`}
        confirmLabel="Ya, Reset Status"
        tone="danger"
        busy={resetting}
        extraContent={
          <label
            htmlFor="reset-clear-locks"
            className="flex min-h-[44px] items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs leading-relaxed text-[var(--ink)]"
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
    </div>
  );
}
