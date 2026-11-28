"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { TimePicker24h } from "@/components/ui/time-picker-24h";
import { addMinutesToHmTime, hmTimeToMinutes } from "@/lib/timezone";
import type {
  ActiveRecipientConfig,
  AttendanceIcsConfig,
  AttendanceScheduleConfig,
  AttendanceStage,
  BotHealthSummary,
  CronHealthSummary,
  IcsAlarmBeforeMinutes,
  IcsDurationMinutes,
  IcsStartOffsetMinutes,
  NotificationChannel,
} from "@/lib/types";

interface BotSettingsCardProps {
  recipient: ActiveRecipientConfig;
  senderName: string;
  schedule: AttendanceScheduleConfig;
  icsConfig: AttendanceIcsConfig;
  botHealth?: BotHealthSummary;
  cronHealth?: CronHealthSummary;
  checkingNow?: boolean;
  onCheckNow?: () => Promise<void>;
  onOpenCronGuide?: () => void;
  onOpenHealthDiagnostics?: () => void;
  onRecipientUpdated: (next: ActiveRecipientConfig) => Promise<void>;
  onConfigChanged: () => Promise<void>;
}

const DEFAULT_WA_TEST_MESSAGE =
  "Halo! Ini pesan tes dari Pengingat Jadwal untuk memastikan bot WhatsApp aktif.";

function normalizeWaPreview(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function isValidWaNormalized(normalized: string): boolean {
  return /^628\d{7,12}$/.test(normalized);
}

const ICS_START_OFFSETS: IcsStartOffsetMinutes[] = [10, 15, 20, 30, 45, 60];
const ICS_DURATIONS: IcsDurationMinutes[] = [15, 30, 60];
const ICS_ALARMS: IcsAlarmBeforeMinutes[] = [0, 5, 10, 15, 30];

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
  icsConfig,
  botHealth,
  cronHealth,
  checkingNow = false,
  onCheckNow,
  onOpenCronGuide,
  onOpenHealthDiagnostics,
  onRecipientUpdated,
  onConfigChanged,
}: BotSettingsCardProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>("recipient");

  const [name, setName] = useState(recipient.name);
  const [email, setEmail] = useState(recipient.email);
  const [whatsapp, setWhatsapp] = useState(recipient.whatsapp ?? "");
  const [channel, setChannel] = useState<NotificationChannel>(recipient.channel ?? "email");
  const [recipientDirty, setRecipientDirty] = useState(false);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [recipientFeedback, setRecipientFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [waTestMessage, setWaTestMessage] = useState(DEFAULT_WA_TEST_MESSAGE);
  const [testingWaSend, setTestingWaSend] = useState(false);
  const [waTestFeedback, setWaTestFeedback] = useState<{
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

  const [icsOpen, setIcsOpen] = useState(false);
  const [icsDraft, setIcsDraft] = useState(() => ({
    enabledStages: { ...icsConfig.enabledStages },
    manualIncludeIcs: icsConfig.manualIncludeIcs,
    startOffsetMinutes: icsConfig.startOffsetMinutes,
    durationMinutes: icsConfig.durationMinutes,
    alarmBeforeMinutes: icsConfig.alarmBeforeMinutes,
  }));
  const [icsDirty, setIcsDirty] = useState(false);
  const [savingIcs, setSavingIcs] = useState(false);
  const [icsFeedback, setIcsFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!recipientDirty) {
      setName(recipient.name);
      setEmail(recipient.email);
      setWhatsapp(recipient.whatsapp ?? "");
      setChannel(recipient.channel ?? "email");
    }
  }, [recipient.name, recipient.email, recipient.whatsapp, recipient.channel, recipientDirty]);

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

  useEffect(() => {
    if (!icsDirty) {
      setIcsDraft({
        enabledStages: {
          morning: icsConfig.enabledStages.morning,
          afternoon: icsConfig.enabledStages.afternoon,
          urgent: icsConfig.enabledStages.urgent,
        },
        manualIncludeIcs: icsConfig.manualIncludeIcs,
        startOffsetMinutes: icsConfig.startOffsetMinutes,
        durationMinutes: icsConfig.durationMinutes,
        alarmBeforeMinutes: icsConfig.alarmBeforeMinutes,
      });
    }
  }, [
    icsConfig.enabledStages.morning,
    icsConfig.enabledStages.afternoon,
    icsConfig.enabledStages.urgent,
    icsConfig.manualIncludeIcs,
    icsConfig.startOffsetMinutes,
    icsConfig.durationMinutes,
    icsConfig.alarmBeforeMinutes,
    icsDirty,
  ]);

  const icsBufferMinutes = icsDraft.startOffsetMinutes - icsDraft.alarmBeforeMinutes;
  const icsValidationError =
    icsBufferMinutes < 5
      ? "Jeda antara waktu kirim dan bunyi alarm minimal 5 menit agar notifikasi Google Calendar sempat masuk di HP."
      : null;

  const icsHeaderSummary = useMemo(() => {
    const activeNames: string[] = [];
    if (icsDraft.enabledStages.morning) activeNames.push("Pagi");
    if (icsDraft.enabledStages.afternoon) activeNames.push("Siang/Sore");
    if (icsDraft.enabledStages.urgent) activeNames.push("Urgent");
    const stageText = activeNames.length > 0 ? activeNames.join("+") : "Off";
    const alarmText =
      icsDraft.alarmBeforeMinutes === 0 ? "Alarm 0m" : `Alarm -${icsDraft.alarmBeforeMinutes}m`;
    return `${stageText} · +${icsDraft.startOffsetMinutes}m · ${alarmText}`;
  }, [icsDraft]);

  const icsSimulationText = useMemo(() => {
    const firstActiveTime =
      (scheduleDraft.morning.enabled && scheduleDraft.morning.time) ||
      (scheduleDraft.afternoon.enabled && scheduleDraft.afternoon.time) ||
      (scheduleDraft.urgent.enabled && scheduleDraft.urgent.time) ||
      "09:00";
    const eventStart = addMinutesToHmTime(firstActiveTime, icsDraft.startOffsetMinutes);
    const eventEnd = addMinutesToHmTime(eventStart, icsDraft.durationMinutes);
    const alarmTime = addMinutesToHmTime(eventStart, -icsDraft.alarmBeforeMinutes);
    return `Simulasi: Kirim ${firstActiveTime} -> Acara ${eventStart}-${eventEnd} WIB -> Notif kalender ~${alarmTime} WIB (buffer aman ${icsBufferMinutes} mnt)`;
  }, [scheduleDraft, icsDraft, icsBufferMinutes]);

  async function handleSaveIcsConfig() {
    if (icsValidationError) return;
    setSavingIcs(true);
    setIcsFeedback(null);

    try {
      const response = await fetch("/api/attendance/ics-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(icsDraft),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: AttendanceIcsConfig;
      };
      if (!response.ok || !body.ok || !body.data) {
        setIcsFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan pengaturan kalender .ics.",
        });
        return;
      }

      setIcsDirty(false);
      setIcsFeedback({
        type: "success",
        text: body.message ?? "Pengaturan .ics tersimpan.",
      });
      await onConfigChanged();
    } catch {
      setIcsFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan pengaturan .ics.",
      });
    } finally {
      setSavingIcs(false);
    }
  }

  async function handleSaveRecipient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedWa = whatsapp.trim();
    const normalizedWa = normalizeWaPreview(trimmedWa);

    if ((channel === "whatsapp" || channel === "both") && !trimmedWa) {
      setRecipientFeedback({
        type: "error",
        text: "Nomor WhatsApp wajib diisi jika kanal WhatsApp atau Keduanya dipilih.",
      });
      return;
    }

    if (trimmedWa && !isValidWaNormalized(normalizedWa)) {
      setRecipientFeedback({
        type: "error",
        text: "Format nomor WhatsApp tidak valid. Gunakan awalan 08xxx atau 628xxx (10-15 digit).",
      });
      return;
    }

    setSavingRecipient(true);
    setRecipientFeedback(null);

    try {
      const response = await fetch("/api/attendance/recipient", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: trimmedWa,
          channel,
        }),
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

      setName(body.data.name);
      setEmail(body.data.email);
      setWhatsapp(body.data.whatsapp ?? "");
      setChannel(body.data.channel ?? "email");
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

  async function handleTestWhatsApp() {
    const rawTarget = whatsapp.trim() || recipient.whatsapp || "";
    const normalizedTarget = normalizeWaPreview(rawTarget);
    if (!normalizedTarget) {
      setWaTestFeedback({
        type: "error",
        text: "Masukkan nomor WhatsApp terlebih dahulu di kolom di atas (contoh: 081234567890).",
      });
      return;
    }

    if (!isValidWaNormalized(normalizedTarget)) {
      setWaTestFeedback({
        type: "error",
        text: "Format nomor WhatsApp belum valid (gunakan awalan 08xxx atau 628xxx, 10-15 digit).",
      });
      return;
    }

    setTestingWaSend(true);
    setWaTestFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: normalizedTarget,
          message: waTestMessage.trim() || undefined,
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
      };

      if (!response.ok || !body.ok) {
        setWaTestFeedback({
          type: "error",
          text: body.message ?? "Gagal mengirim pesan tes WhatsApp.",
        });
        return;
      }

      setWaTestFeedback({
        type: "success",
        text: body.message ?? `Pesan tes WhatsApp terkirim ke ${normalizedTarget}.`,
      });
      await onConfigChanged();
    } catch {
      setWaTestFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim pesan tes WhatsApp.",
      });
    } finally {
      setTestingWaSend(false);
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-recipient-whatsapp"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Nomor WhatsApp <span className="font-normal text-[var(--ink-muted)]">(Opsional)</span>
                </label>
                <input
                  id="settings-recipient-whatsapp"
                  type="tel"
                  inputMode="numeric"
                  maxLength={30}
                  value={whatsapp}
                  onChange={(event) => {
                    setWhatsapp(event.target.value);
                    setRecipientDirty(true);
                    if (recipientFeedback) setRecipientFeedback(null);
                    if (waTestFeedback) setWaTestFeedback(null);
                  }}
                  placeholder="08xxxxxxxxxx atau 628xxxxxxxxxx"
                  className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-[var(--ink)]">
                  Kanal Pengiriman Pengingat
                </span>
                <div
                  role="radiogroup"
                  aria-label="Kanal pengiriman pengingat"
                  className="mt-1 grid min-h-[44px] grid-cols-3 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] p-1"
                >
                  {(
                    [
                      { value: "email", label: "Email" },
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "both", label: "Keduanya" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={channel === option.value}
                      onClick={() => {
                        setChannel(option.value);
                        setRecipientDirty(true);
                        if (recipientFeedback) setRecipientFeedback(null);
                      }}
                      className={`rounded-lg px-2 text-xs font-semibold transition-colors ${
                        channel === option.value
                          ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/70 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Uji Coba Bot WhatsApp
                </span>
              </div>

              {onOpenHealthDiagnostics ? (
                <button
                  type="button"
                  onClick={onOpenHealthDiagnostics}
                  className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
                >
                  Lihat di Diagnosa Kesehatan Bot
                </button>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="wa-test-custom-message"
                  className="text-[11px] font-semibold text-[var(--ink-muted)]"
                >
                  Pesan Tes Custom
                </label>
                <div className="flex items-center gap-2.5">
                  {waTestMessage !== DEFAULT_WA_TEST_MESSAGE ? (
                    <button
                      type="button"
                      onClick={() => setWaTestMessage(DEFAULT_WA_TEST_MESSAGE)}
                      className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                    >
                      Reset Default
                    </button>
                  ) : null}
                  <span className="font-mono-num text-[11px] text-[var(--ink-muted)]">
                    {waTestMessage.length}/1000
                  </span>
                </div>
              </div>

              <textarea
                id="wa-test-custom-message"
                rows={2}
                maxLength={1000}
                value={waTestMessage}
                onChange={(event) => {
                  setWaTestMessage(event.target.value);
                  if (waTestFeedback) setWaTestFeedback(null);
                }}
                placeholder={DEFAULT_WA_TEST_MESSAGE}
                className="mt-1 w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 py-2 text-xs leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {(() => {
                const rawTarget = whatsapp.trim() || recipient.whatsapp || "";
                const preview = normalizeWaPreview(rawTarget);
                return preview ? (
                  <span className="font-mono-num text-[11px] text-[var(--ink-muted)]">
                    Dikirim ke: <strong className="text-[var(--ink)]">{preview}</strong>
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--warning-fg)]">
                    Isi Nomor WhatsApp di atas untuk tes kirim.
                  </span>
                );
              })()}

              <button
                type="button"
                onClick={() => void handleTestWhatsApp()}
                disabled={testingWaSend}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                <span>{testingWaSend ? "Mengirim..." : "Tes Kirim WA"}</span>
              </button>
            </div>

            {waTestFeedback ? (
              <div
                role={waTestFeedback.type === "error" ? "alert" : "status"}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  waTestFeedback.type === "error"
                    ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                    : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                }`}
              >
                {waTestFeedback.type === "error" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                )}
                <span>{waTestFeedback.text}</span>
              </div>
            ) : null}
          </div>

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
                Nama Pengirim untuk Pasangan
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
                  placeholder="Nama pengirim email pasangan"
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
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                Dipakai untuk Pengingat Absen &amp; Date Itinerary saja (tidak terbawa ke Acara &amp; Kegiatan).
              </p>
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

          <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
            <button
              type="button"
              aria-expanded={icsOpen}
              onClick={() => setIcsOpen((prev) => !prev)}
              className="flex min-h-[36px] w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--ink)]">Undangan Kalender (.ics)</p>
                  <p className="font-mono-num truncate text-[11px] text-[var(--ink-muted)]">
                    {icsHeaderSummary}
                  </p>
                </div>
              </div>
              {icsOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" strokeWidth={2} aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            {icsOpen ? (
              <div className="mt-3.5 space-y-3 border-t border-[var(--border-subtle)] pt-3.5">
                <div>
                  <span className="block text-xs font-semibold text-[var(--ink)]">
                    Sertakan .ics pada tahap:
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: "morning", label: "Pagi" },
                        { key: "afternoon", label: "Siang/Sore" },
                        { key: "urgent", label: "Urgent" },
                      ] as const
                    ).map((item) => {
                      const active = icsDraft.enabledStages[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setIcsDraft((prev) => ({
                              ...prev,
                              enabledStages: {
                                ...prev.enabledStages,
                                [item.key]: !active,
                              },
                            }));
                            setIcsDirty(true);
                            if (icsFeedback) setIcsFeedback(null);
                          }}
                          className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                              : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setIcsDraft((prev) => ({
                          ...prev,
                          manualIncludeIcs: !prev.manualIncludeIcs,
                        }));
                        setIcsDirty(true);
                        if (icsFeedback) setIcsFeedback(null);
                      }}
                      className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        icsDraft.manualIncludeIcs
                          ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                          : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      Kirim Manual
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="ics-start-offset"
                      className="block text-[11px] font-semibold text-[var(--ink)]"
                    >
                      Mulai (stlh kirim)
                    </label>
                    <select
                      id="ics-start-offset"
                      value={icsDraft.startOffsetMinutes}
                      onChange={(event) => {
                        const nextOffset = Number(event.target.value) as IcsStartOffsetMinutes;
                        setIcsDraft((prev) => {
                          let nextAlarm = prev.alarmBeforeMinutes;
                          if (nextOffset - nextAlarm < 5) {
                            nextAlarm = nextOffset >= 10 ? 5 : 0;
                          }
                          return {
                            ...prev,
                            startOffsetMinutes: nextOffset,
                            alarmBeforeMinutes: nextAlarm,
                          };
                        });
                        setIcsDirty(true);
                        if (icsFeedback) setIcsFeedback(null);
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-base text-[var(--ink)] sm:text-xs"
                    >
                      {ICS_START_OFFSETS.map((m) => (
                        <option key={m} value={m}>
                          +{m} mnt
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ics-duration"
                      className="block text-[11px] font-semibold text-[var(--ink)]"
                    >
                      Durasi
                    </label>
                    <select
                      id="ics-duration"
                      value={icsDraft.durationMinutes}
                      onChange={(event) => {
                        setIcsDraft((prev) => ({
                          ...prev,
                          durationMinutes: Number(event.target.value) as IcsDurationMinutes,
                        }));
                        setIcsDirty(true);
                        if (icsFeedback) setIcsFeedback(null);
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-base text-[var(--ink)] sm:text-xs"
                    >
                      {ICS_DURATIONS.map((m) => (
                        <option key={m} value={m}>
                          {m} menit
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ics-alarm-before"
                      className="block text-[11px] font-semibold text-[var(--ink)]"
                    >
                      Alarm Kalender
                    </label>
                    <select
                      id="ics-alarm-before"
                      value={icsDraft.alarmBeforeMinutes}
                      onChange={(event) => {
                        setIcsDraft((prev) => ({
                          ...prev,
                          alarmBeforeMinutes: Number(event.target.value) as IcsAlarmBeforeMinutes,
                        }));
                        setIcsDirty(true);
                        if (icsFeedback) setIcsFeedback(null);
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-2.5 text-base text-[var(--ink)] sm:text-xs"
                    >
                      {ICS_ALARMS.map((m) => {
                        const violatesBuffer = icsDraft.startOffsetMinutes - m < 5;
                        return (
                          <option key={m} value={m} disabled={violatesBuffer}>
                            {m === 0 ? "Saat acara mulai (0 mnt)" : `${m} mnt sebelum`}
                            {violatesBuffer ? " (buffer < 5m)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <p className="font-mono-num rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                  {icsSimulationText}
                </p>

                {icsValidationError ? (
                  <p role="alert" className="text-xs font-medium text-[var(--danger-fg)]">
                    {icsValidationError}
                  </p>
                ) : null}

                {icsFeedback ? (
                  <div
                    role={icsFeedback.type === "error" ? "alert" : "status"}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                      icsFeedback.type === "error"
                        ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                        : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
                    }`}
                  >
                    <span>{icsFeedback.text}</span>
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={savingIcs || Boolean(icsValidationError)}
                  onClick={() => void handleSaveIcsConfig()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-4 text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50 sm:w-auto"
                >
                  {savingIcs ? "Menyimpan..." : "Simpan Pengaturan .ics"}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      {cronHealth || botHealth ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-[11px]">
          <div className="flex min-w-0 items-center gap-1.5 text-[var(--ink-muted)]">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                botHealth
                  ? botHealth.checks.scheduler.status === "ok"
                    ? "bg-emerald-500"
                    : botHealth.checks.scheduler.status === "warning"
                      ? "bg-amber-400"
                      : "bg-rose-500"
                  : cronHealth?.status === "healthy"
                    ? "bg-emerald-500"
                    : "bg-amber-400"
              }`}
              aria-hidden="true"
            />
            <span className="truncate">
              {botHealth
                ? `${botHealth.checks.scheduler.label}: ${botHealth.checks.scheduler.detail}`
                : cronHealth?.status === "healthy"
                  ? `Scheduler aktif · ${cronHealth.minutesSinceLastPing} mnt lalu`
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
