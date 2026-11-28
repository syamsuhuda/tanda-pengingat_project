"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  BellOff,
  Calendar,
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Mail,
  Pause,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { BotSettingsCard } from "@/components/dashboard/bot-settings-card";
import { CustomMessageCard } from "@/components/dashboard/custom-message-card";
import { ManualTriggerModal } from "@/components/dashboard/manual-trigger-modal";
import { OffDaysCard } from "@/components/dashboard/off-days-card";
import type { LiveConnectionState } from "@/hooks/useLiveDashboardStatus";
import {
  formatHmTimeWibLabel,
  formatIsoToWibTime,
  getCurrentWibMinutes,
  hmTimeToMinutes,
} from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
  BotHealthSummary,
  DashboardStatusData,
  TimelineStageStatus,
} from "@/lib/types";

interface AttendanceTabProps {
  data: DashboardStatusData;
  connectionState: LiveConnectionState;
  onRefresh: () => Promise<void>;
  onRecipientUpdated: (next: ActiveRecipientConfig) => Promise<void>;
  onOpenSecurityModal?: () => void;
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
  missed: {
    label: "Terlewat",
    className:
      "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]",
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
  connectionState,
  onRefresh,
  onRecipientUpdated,
  onOpenSecurityModal,
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
  const [checkingNow, setCheckingNow] = useState(false);
  const [healthDialogOpen, setHealthDialogOpen] = useState(false);
  const [healthCheckBusy, setHealthCheckBusy] = useState(false);
  const [liveBotHealthOverride, setLiveBotHealthOverride] = useState<BotHealthSummary | null>(null);
  const [cronGuideOpen, setCronGuideOpen] = useState(false);
  const [copiedCronUrl, setCopiedCronUrl] = useState(false);
  const [nowWibMinutes, setNowWibMinutes] = useState(() => getCurrentWibMinutes());

  useEffect(() => {
    setNowWibMinutes(getCurrentWibMinutes());
    const interval = window.setInterval(() => {
      setNowWibMinutes(getCurrentWibMinutes());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [data.nowWibIso]);

  useEffect(() => {
    setPauseDraft(data.pauseConfig.paused);
    if (!pauseNoteDirty) {
      setPauseNote(data.pauseConfig.note ?? "");
    }
  }, [data.pauseConfig.paused, data.pauseConfig.note, pauseNoteDirty]);

  useEffect(() => {
    setLiveBotHealthOverride(null);
  }, [data.version, data.botHealth.checkedAt]);

  useEffect(() => {
    if (!cronGuideOpen && !healthDialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCronGuideOpen(false);
        setHealthDialogOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cronGuideOpen, healthDialogOpen]);

  const baseBotHealth = liveBotHealthOverride ?? data.botHealth;
  const effectiveBotHealth: BotHealthSummary =
    connectionState === "offline"
      ? {
          ...baseBotHealth,
          state: "offline",
          label: "Koneksi Terputus",
          severity: "error",
          summary: "Browser offline atau server gagal dihubungi 2 kali berturut-turut.",
          detail: "Periksa koneksi internet lalu tekan Cek Ulang Sekarang.",
        }
      : baseBotHealth;

  async function handleRunHealthCheck() {
    setHealthCheckBusy(true);
    setStatusFeedback(null);

    try {
      const response = await fetch("/api/health/check", {
        method: "POST",
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: {
          botHealth?: BotHealthSummary;
        };
      };

      if (!response.ok || !body.ok || !body.data?.botHealth) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal memeriksa kesehatan sistem.",
        });
        return;
      }

      setLiveBotHealthOverride(body.data.botHealth);
      setStatusFeedback({
        type: body.data.botHealth.severity === "error" ? "error" : "success",
        text: body.message ?? "Pemeriksaan kesehatan sistem selesai.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat memeriksa kesehatan sistem.",
      });
    } finally {
      setHealthCheckBusy(false);
    }
  }

  const isConfirmed = data.attendance !== null;
  const isTodayOff = data.todayOffDay.isOff;
  const isTomorrowOff = data.upcomingOffDays.some((item) => item.date === data.tomorrowWib);

  const activeStageTimesText = (["morning", "afternoon", "urgent"] as const)
    .filter((stage) => data.schedule[stage].enabled)
    .map((stage) => formatHmTimeWibLabel(data.schedule[stage].time))
    .join(", ");

  const nextWaitingStage = data.timeline.find((item) => item.status === "waiting");

  const enabledStagesCount = data.timeline.filter((item) => item.status !== "disabled").length;
  const sentStagesCount = data.timeline.filter((item) => item.status === "sent").length;

  const nextScheduleCountdownText = (() => {
    if (isConfirmed || isTodayOff) {
      return "Pengingat berhenti sampai besok";
    }
    if (pauseDraft) {
      return "Dijeda manual";
    }
    if (!nextWaitingStage) {
      return "Semua jadwal hari ini selesai";
    }
    const targetMinutes = hmTimeToMinutes(data.schedule[nextWaitingStage.stage].time);
    const diff = targetMinutes - nowWibMinutes;
    if (diff <= 0) {
      return "Dalam jendela kirim";
    }
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours === 0) {
      return `${mins} mnt lagi`;
    }
    return mins === 0 ? `±${hours} jam lagi` : `±${hours} jam ${mins} mnt lagi`;
  })();

  function scrollToCustomMessage() {
    const el = document.getElementById("custom-message-textarea");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLTextAreaElement) {
        el.focus({ preventScroll: true });
      }
    }
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
        text: nextPaused ? "Bot dijeda sementara." : "Bot diaktifkan kembali.",
      });
      await onRefresh();
    } catch {
      setPauseDraft(data.pauseConfig.paused);
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan status bot.",
      });
    } finally {
      setSavingPause(false);
    }
  }

  async function handleCheckNow() {
    setCheckingNow(true);
    setStatusFeedback(null);

    try {
      const response = await fetch("/api/attendance/check-now", {
        method: "POST",
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: { status?: string; scheduledTimeWib?: string };
      };
      if (!response.ok || !body.ok) {
        setStatusFeedback({
          type: "error",
          text: body.message ?? "Gagal mengecek jadwal saat ini.",
        });
        return;
      }

      setStatusFeedback({
        type: "success",
        text: body.message ?? "Evaluasi jadwal selesai.",
      });
      await onRefresh();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Koneksi gagal saat menjalankan pengecekan jadwal.",
      });
    } finally {
      setCheckingNow(false);
    }
  }

  const cronEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/cron/attendance`
      : "https://<domain-vercel-anda>/api/cron/attendance";

  const heroBorderClass = pauseDraft
    ? "border-[var(--warning-border)]"
    : isConfirmed
      ? "border-[var(--success-border)]"
      : isTodayOff
        ? "border-[var(--off-border)]"
        : "border-[var(--border-subtle)]";

  const pillStyles =
    effectiveBotHealth.state === "active"
      ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
      : effectiveBotHealth.state === "holiday"
        ? "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]"
        : effectiveBotHealth.severity === "warning"
          ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
          : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]";

  const pillDotClass =
    effectiveBotHealth.state === "active"
      ? "bg-emerald-500 animate-pulse"
      : effectiveBotHealth.state === "holiday"
        ? "bg-sky-500"
        : effectiveBotHealth.severity === "warning"
          ? "bg-amber-500"
          : "bg-rose-500";

  return (
    <div className="space-y-5">
      {data.pinMigrationRecommended ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-xs leading-relaxed text-[var(--warning-fg)]"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>
              Saat ini kamu masih memakai PIN bawaan lama. Disarankan memperbarui ke <strong>PIN 6 digit</strong> melalui tombol{" "}
              {onOpenSecurityModal ? (
                <button
                  type="button"
                  onClick={onOpenSecurityModal}
                  className="font-bold underline"
                >
                  Keamanan &amp; Ubah PIN
                </button>
              ) : (
                <strong>Keamanan &amp; Ubah PIN</strong>
              )}{" "}
              di pojok kanan atas.
            </span>
          </div>
        </div>
      ) : null}

      <section
        aria-labelledby="today-status-heading"
        className={`rounded-2xl border bg-[var(--surface)] p-4 shadow-xs sm:p-5 ${heroBorderClass}`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5">
          <div className="flex h-full flex-col justify-between gap-4 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHealthDialogOpen((prev) => !prev)}
                aria-expanded={healthDialogOpen}
                title="Klik untuk melihat diagnosa kesehatan sistem bot"
                className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition-opacity hover:opacity-90 ${pillStyles}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${pillDotClass}`} aria-hidden="true" />
                <span>{effectiveBotHealth.label}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-75" strokeWidth={2} aria-hidden="true" />
              </button>

              <span className="font-mono-num rounded-md bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                {data.todayFormatted}
              </span>
              <span className="rounded-md bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">
                Untuk {data.recipient.name}
              </span>
            </div>

            <div className="flex items-center gap-3.5">
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
                  ) : pauseDraft ? (
                    <>
                      Pengiriman otomatis dijeda sementara{data.pauseConfig.note ? ` (${data.pauseConfig.note})` : ""}.
                    </>
                  ) : (
                    "Menunggu konfirmasi absen hari ini."
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/65 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1" aria-hidden="true">
                  {data.timeline.map((item) => {
                    const isNext =
                      !isConfirmed &&
                      !isTodayOff &&
                      !pauseDraft &&
                      nextWaitingStage?.stage === item.stage;
                    const segClass =
                      item.status === "sent"
                        ? "bg-emerald-500"
                        : isNext
                          ? "bg-[var(--accent)]"
                          : item.status === "missed"
                            ? "bg-rose-500"
                            : "bg-[var(--ink-muted)]/35";
                    return (
                      <span
                        key={item.stage}
                        className={`h-1.5 w-3.5 rounded-full ${segClass}`}
                      />
                    );
                  })}
                </span>
                <span className="font-mono-num font-semibold text-[var(--ink)]">
                  {isConfirmed
                    ? "Selesai hari ini"
                    : isTodayOff
                      ? "Jadwal libur aktif"
                      : `${sentStagesCount}/${enabledStagesCount} terkirim`}
                </span>
              </div>

              <span className="hidden h-3.5 w-px bg-[var(--border-subtle)] sm:inline-block" aria-hidden="true" />

              <span className="font-mono-num text-[var(--ink-muted)]">
                {nextScheduleCountdownText}
              </span>

              <span className="hidden h-3.5 w-px bg-[var(--border-subtle)] sm:inline-block" aria-hidden="true" />

              <button
                type="button"
                onClick={scrollToCustomMessage}
                className="inline-flex items-center gap-1.5 font-medium transition-colors hover:underline"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    data.customMessage ? "bg-[var(--accent)]" : "bg-[var(--ink-muted)]/45"
                  }`}
                  aria-hidden="true"
                />
                {data.customMessage ? (
                  <span className="text-[var(--ink)]">
                    Catatan aktif{" "}
                    <span className="text-[var(--ink-muted)]">
                      ({data.customMessage.scope === "always" ? "Pakai terus" : "Hari ini"})
                    </span>
                  </span>
                ) : (
                  <span className="text-[var(--ink-muted)]">Tanpa catatan</span>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-2 lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                Rangkaian Pengingat Hari Ini
              </span>
              {!isConfirmed && !isTodayOff && !pauseDraft ? (
                nextWaitingStage ? (
                  <span className="font-mono-num inline-flex items-center gap-1.5 rounded-md border border-[var(--off-border)] bg-[var(--accent-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                    <span>Berikutnya: {nextWaitingStage.scheduledTimeWib}</span>
                  </span>
                ) : (
                  <span className="rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                    Semua jadwal hari ini selesai
                  </span>
                )
              ) : null}
            </div>

            <div className="grid flex-1 grid-cols-1 items-stretch gap-2.5 sm:grid-cols-3">
              {data.timeline.map((item) => {
                const badge = TIMELINE_META[item.status];
                const isNextStage =
                  !isConfirmed &&
                  !isTodayOff &&
                  !pauseDraft &&
                  nextWaitingStage?.stage === item.stage;
                const hasIcs = data.icsConfig.enabledStages[item.stage];

                return (
                  <div
                    key={item.stage}
                    className={`flex h-full min-w-0 flex-col justify-between rounded-2xl border p-3 ${
                      isNextStage
                        ? "border-[var(--accent)]/60 bg-[var(--accent-tint)]/45"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono-num flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-[var(--ink)]">
                        {isNextStage ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span>{item.scheduledTimeWib}</span>
                      </p>
                      <p className="mt-0.5 truncate whitespace-nowrap text-xs text-[var(--ink-muted)]">
                        {item.stage === "morning"
                          ? "Pagi"
                          : item.stage === "afternoon"
                            ? "Cek Siang / Sore"
                            : "Urgent + Alert"}
                      </p>
                    </div>

                    <div className="mt-2 flex min-h-[24px] items-center">
                      {hasIcs ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[var(--accent-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                          <Calendar className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                          <span>+ Kalender</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-[var(--ink-muted)]/85">
                          <Mail className="h-3 w-3 shrink-0 opacity-75" strokeWidth={1.8} aria-hidden="true" />
                          <span>Email saja</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center pt-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                      >
                        {item.status === "sent" ? (
                          <Check className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                        ) : item.status === "missed" ? (
                          <AlertTriangle className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {effectiveBotHealth.severity !== "ok" ? (
          <div
            role="status"
            className={`mt-4 flex flex-col gap-3 rounded-xl border px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
              effectiveBotHealth.severity === "error"
                ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <div>
                <p className="font-bold">{effectiveBotHealth.summary}</p>
                <p className="mt-0.5 leading-relaxed opacity-90">{effectiveBotHealth.detail}</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {effectiveBotHealth.state === "scheduler_down" ||
              effectiveBotHealth.state === "scheduler_delayed" ? (
                <button
                  type="button"
                  onClick={() => setCronGuideOpen(true)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--ink)] px-3.5 text-xs font-bold text-[var(--bg)] transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  Panduan Cron
                </button>
              ) : effectiveBotHealth.state === "no_schedule" ? (
                <a
                  href="#bot-settings-heading"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--ink)] px-3.5 text-xs font-bold text-[var(--bg)] transition-opacity hover:opacity-90"
                >
                  Buka Jam Kirim
                </a>
              ) : (
                <button
                  type="button"
                  disabled={healthCheckBusy}
                  onClick={() => void handleRunHealthCheck()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--surface-elevated)] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${healthCheckBusy ? "animate-spin" : ""}`}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <span>{healthCheckBusy ? "Mengecek..." : "Cek Koneksi"}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {statusFeedback ? (
          <div
            role={statusFeedback.type === "error" ? "alert" : "status"}
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${statusFeedback.type === "error"
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

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="btn-primary-accent inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors active:scale-[0.98] sm:w-auto"
          >
            <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>Kirim Pengingat Sekarang</span>
          </button>

          {!isConfirmed ? (
            <button
              type="button"
              onClick={() => void handleManualConfirmToday()}
              disabled={confirmingManual}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] px-3.5 text-xs font-bold text-[var(--success-fg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60 sm:w-auto"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>{confirmingManual ? "Menyimpan..." : "Tandai Sudah Absen"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setResetDialogOpen(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.98] sm:w-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Reset Status</span>
            </button>
          )}

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              disabled={quickOffBusy !== null}
              onClick={() => void toggleQuickOffDay("today")}
              className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 sm:px-3.5 ${isTodayOff
                  ? "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]"
                  : "border-[var(--border-control)] bg-[var(--surface-elevated)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                }`}
            >
              <CalendarOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="truncate">
                {quickOffBusy === "today"
                  ? "..."
                  : isTodayOff
                    ? "Batal Libur Hari Ini"
                    : "Liburkan Hari Ini"}
              </span>
            </button>

            <button
              type="button"
              disabled={quickOffBusy !== null}
              onClick={() => void toggleQuickOffDay("tomorrow")}
              className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 sm:px-3.5 ${isTomorrowOff
                  ? "border-[var(--off-border)] bg-[var(--off-bg)] text-[var(--off-fg)]"
                  : "border-[var(--border-control)] bg-[var(--surface-elevated)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                }`}
            >
              <CalendarOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="truncate">
                {quickOffBusy === "tomorrow"
                  ? "..."
                  : isTomorrowOff
                    ? "Batal Libur Besok"
                    : "Liburkan Besok"}
              </span>
            </button>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {pauseDraft ? (
              <button
                type="button"
                disabled={savingPause}
                onClick={() => {
                  setPauseDraft(false);
                  void savePauseConfig(false, pauseNote);
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 sm:flex-none"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                <span>{savingPause ? "Mengaktifkan..." : "Aktifkan Bot"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={savingPause}
                onClick={() => {
                  setPauseDraft(true);
                  void savePauseConfig(true, pauseNote);
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 text-xs font-bold text-[var(--warning-fg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-50 sm:flex-none"
              >
                <Pause className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                <span>{savingPause ? "Menjeda..." : "Jeda Bot"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPauseNoteExpanded((prev) => !prev)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            >
              {pauseNoteExpanded || pauseDraft ? "Tutup Catatan" : "Catatan Jeda"}
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
              className="min-h-[44px] flex-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:min-h-[40px] sm:text-xs"
            />
            <button
              type="button"
              disabled={savingPause}
              onClick={() => void savePauseConfig(pauseDraft, pauseNote)}
              className="min-h-[44px] shrink-0 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50 sm:min-h-[40px]"
            >
              {savingPause ? "Menyimpan..." : "Simpan Catatan"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col gap-5 lg:col-span-6">
          <div className="shrink-0">
            <CustomMessageCard
              customMessage={data.customMessage}
              recipientName={data.recipient.name}
              onChanged={onRefresh}
            />
          </div>

          <ActivityLogsCard
            logs={data.logs}
            className="flex min-h-[320px] flex-1 flex-col"
          />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-6">
          <div className="shrink-0">
            <BotSettingsCard
              recipient={data.recipient}
              senderName={data.senderName}
              schedule={data.schedule}
              icsConfig={data.icsConfig}
              botHealth={effectiveBotHealth}
              cronHealth={data.cronHealth}
              checkingNow={healthCheckBusy || checkingNow}
              onCheckNow={handleRunHealthCheck}
              onOpenCronGuide={() => setCronGuideOpen(true)}
              onRecipientUpdated={onRecipientUpdated}
              onConfigChanged={onRefresh}
            />
          </div>

          <OffDaysCard
            todayWib={data.todayWib}
            tomorrowWib={data.tomorrowWib}
            upcomingOffDays={data.upcomingOffDays}
            onChanged={onRefresh}
            className="flex flex-col lg:flex-1"
          />
        </div>
      </div>

      <ManualTriggerModal
        open={manualModalOpen}
        todayWib={data.todayWib}
        recipientName={data.recipient.name}
        recipientEmail={data.recipient.email}
        recipientWhatsapp={data.recipient.whatsapp}
        recipientChannel={data.recipient.channel}
        defaultSenderName={data.senderName}
        isAlreadyConfirmed={isConfirmed}
        activeCustomMessage={data.customMessage?.message ?? null}
        icsConfig={data.icsConfig}
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

      {healthDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bot-health-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setHealthDialogOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold ${pillStyles}`}>
                  <span className={`h-2 w-2 rounded-full ${pillDotClass}`} aria-hidden="true" />
                  <span>{effectiveBotHealth.label}</span>
                </div>
                <h2 id="bot-health-dialog-title" className="font-display mt-2 text-lg font-bold text-[var(--ink)]">
                  Diagnosa Kesehatan Bot
                </h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  {effectiveBotHealth.summary}
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup diagnosa kesehatan bot"
                onClick={() => setHealthDialogOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {[
                effectiveBotHealth.checks.redis,
                effectiveBotHealth.checks.scheduler,
                effectiveBotHealth.checks.delivery,
                effectiveBotHealth.checks.schedule,
              ].map((check) => {
                const dotColor =
                  check.status === "ok"
                    ? "bg-emerald-500"
                    : check.status === "warning"
                      ? "bg-amber-500"
                      : "bg-rose-500";
                return (
                  <div
                    key={check.label}
                    className="flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--ink)]">{check.label}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                        {check.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={healthCheckBusy}
                onClick={() => void handleRunHealthCheck()}
                className="btn-primary-accent inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${healthCheckBusy ? "animate-spin" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>{healthCheckBusy ? "Menguji Server & SMTP..." : "Cek Ulang Sekarang"}</span>
              </button>
              <button
                type="button"
                disabled={checkingNow}
                onClick={() => void handleCheckNow()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                {checkingNow ? "Mengecek..." : "Evaluasi Jadwal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cronGuideOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cron-guide-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCronGuideOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lg sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="cron-guide-title" className="font-display text-lg font-bold text-[var(--ink)]">
                  Hubungkan Scheduler Otomatis
                </h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  Pilih <strong>cron-job.org</strong> (presisi 1-5 menit) atau <strong>GitHub Actions</strong>.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup panduan cron"
                onClick={() => setCronGuideOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-[var(--ink)]">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
                <p className="font-semibold text-[var(--ink)]">1. Endpoint Cron Server</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="font-mono-num min-w-0 flex-1 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--ink)]">
                    {cronEndpointUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(cronEndpointUrl);
                      setCopiedCronUrl(true);
                      setTimeout(() => setCopiedCronUrl(false), 2000);
                    }}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    <span>{copiedCronUrl ? "Tersalin" : "Salin"}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 space-y-1.5">
                <p className="font-semibold text-[var(--ink)]">2. Pengaturan di cron-job.org (Gratis, 1-5 Menit)</p>
                <p className="text-[var(--ink-muted)]">
                  Method: <code className="font-mono-num text-[var(--ink)]">POST</code> (atau <code className="font-mono-num text-[var(--ink)]">GET</code>) · Interval: <strong>Every 1 minute</strong> / <strong>5 minutes</strong>
                </p>
                <p className="text-[var(--ink-muted)]">
                  Header: <code className="font-mono-num text-[var(--ink)]">Authorization: Bearer &lt;CRON_SECRET_VERCEL&gt;</code>
                </p>
                <p className="text-[var(--ink-muted)]">
                  Body JSON (untuk POST): <code className="font-mono-num text-[var(--ink)]">{`{"stage":"auto"}`}</code>
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 space-y-1">
                <p className="font-semibold text-[var(--ink)]">3. Alternatif GitHub Actions</p>
                <p className="text-[var(--ink-muted)]">
                  Isi Repository Secrets <strong>APP_URL</strong> &amp; <strong>CRON_SECRET</strong> di GitHub, lalu aktifkan workflow <em>Daily Attendance Reminder Cron</em>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCronGuideOpen(false)}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--ink)] text-xs font-bold text-[var(--bg)] hover:opacity-90"
            >
              Tutup
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
