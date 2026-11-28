"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Mail, MessageCircle, Send, X } from "lucide-react";
import type { AttendanceIcsConfig, NotificationChannel } from "@/lib/types";

interface ManualTriggerModalProps {
  open: boolean;
  todayWib: string;
  recipientName: string;
  recipientEmail: string;
  recipientWhatsapp?: string;
  recipientChannel?: NotificationChannel;
  defaultSenderName: string;
  isAlreadyConfirmed: boolean;
  activeCustomMessage: string | null;
  icsConfig: AttendanceIcsConfig;
  onClose: () => void;
  onSent: () => Promise<void>;
}

export function ManualTriggerModal({
  open,
  todayWib,
  recipientName,
  recipientEmail,
  recipientWhatsapp,
  recipientChannel = "email",
  defaultSenderName,
  isAlreadyConfirmed,
  activeCustomMessage,
  icsConfig,
  onClose,
  onSent,
}: ManualTriggerModalProps) {
  const [note, setNote] = useState(activeCustomMessage ?? "");
  const [noteTouched, setNoteTouched] = useState(false);
  const [overrideSenderOpen, setOverrideSenderOpen] = useState(false);
  const [senderOverride, setSenderOverride] = useState(defaultSenderName);
  const [senderTouched, setSenderTouched] = useState(false);
  const [includeIcs, setIncludeIcs] = useState(icsConfig.manualIncludeIcs);
  const [channel, setChannel] = useState<NotificationChannel>(recipientChannel);
  const [forceSend, setForceSend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Inisialisasi ulang modal hanya saat transisi tertutup -> terbuka agar ketikan, centang, dan feedback tidak pernah ter-reset oleh polling/submit.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setFeedback(null);
      setForceSend(false);
      setOverrideSenderOpen(false);
      setSenderOverride(defaultSenderName);
      setSenderTouched(false);
      setIncludeIcs(icsConfig.manualIncludeIcs);
      setChannel(recipientChannel);
      setNote(activeCustomMessage ?? "");
      setNoteTouched(false);
    }
    wasOpenRef.current = open;
  }, [open, activeCustomMessage, defaultSenderName, icsConfig.manualIncludeIcs, recipientChannel]);

  useEffect(() => {
    if (open && !noteTouched) {
      setNote(activeCustomMessage ?? "");
    }
  }, [open, activeCustomMessage, noteTouched]);

  useEffect(() => {
    if (open && !senderTouched) {
      setSenderOverride(defaultSenderName);
    }
  }, [open, defaultSenderName, senderTouched]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAlreadyConfirmed && !forceSend) {
      setFeedback({
        type: "error",
        text: "Hari ini sudah tercatat absen. Centang konfirmasi kirim ulang jika tetap ingin mengirim.",
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customNote: note.trim() || undefined,
          senderName:
            overrideSenderOpen && senderOverride.trim()
              ? senderOverride.trim()
              : undefined,
          useActiveMessage: false,
          includeIcs,
          channel,
          forceSend: isAlreadyConfirmed ? forceSend : false,
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
      };

      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal mengirim pengingat manual.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text: body.message ?? `Pengingat terkirim ke ${recipientName}.`,
      });
      await onSent();
      setTimeout(() => {
        onClose();
      }, 650);
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim pengingat.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-trigger-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl sm:p-6"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="manual-trigger-title"
              className="font-display text-xl font-semibold text-[var(--ink)]"
            >
              Kirim Pengingat ke {recipientName}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {recipientEmail} · {todayWib}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup modal kirim pengingat"
            className="-mt-1 -mr-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            <X className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="modal-manual-note"
                className="text-sm font-semibold text-[var(--ink)]"
              >
                Catatan pribadi (opsional)
              </label>
              {note ? (
                <button
                  type="button"
                  onClick={() => {
                    setNote("");
                    setNoteTouched(true);
                  }}
                  className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
                >
                  Kosongkan
                </button>
              ) : null}
            </div>
            <textarea
              id="modal-manual-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteTouched(true);
              }}
              placeholder="Contoh: Jangan lupa absen sebelum rapat jam 10 ya."
              className="mt-1.5 w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--ink)]">
              Kanal Pengiriman
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] p-1">
              {(
                [
                  { value: "email", label: "Email", icon: Mail },
                  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                  { value: "both", label: "Keduanya", icon: Send },
                ] as const
              ).map((opt) => {
                const disabled =
                  !recipientWhatsapp && (opt.value === "whatsapp" || opt.value === "both");
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setChannel(opt.value)}
                    className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      channel === opt.value
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {!recipientWhatsapp ? (
              <p className="text-[11px] text-[var(--ink-muted)]">
                Isi nomor WhatsApp di Pengaturan Bot &gt; Penerima untuk mengaktifkan kanal WhatsApp.
              </p>
            ) : null}
          </div>

          <label
            htmlFor="modal-include-ics"
            className="flex min-h-[44px] items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-sm text-[var(--ink)]"
          >
            <input
              id="modal-include-ics"
              type="checkbox"
              checked={includeIcs}
              onChange={(event) => setIncludeIcs(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <div>
              <span>Sertakan undangan kalender &amp; tombol Google Calendar</span>
              <span className="font-mono-num mt-0.5 block text-[11px] text-[var(--ink-muted)]">
                Mulai +{icsConfig.startOffsetMinutes}m · Durasi {icsConfig.durationMinutes}m · Alarm{" "}
                {icsConfig.alarmBeforeMinutes === 0
                  ? "saat mulai"
                  : `${icsConfig.alarmBeforeMinutes}m sebelum`}
              </span>
            </div>
          </label>

          <div>
            <button
              type="button"
              onClick={() => setOverrideSenderOpen((prev) => !prev)}
              className="text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
            >
              {overrideSenderOpen
                ? "Tutup ubah nama pengirim"
                : `Ubah nama pengirim untuk kiriman ini (default: ${defaultSenderName})`}
            </button>

            {overrideSenderOpen ? (
              <div className="mt-2">
                <label htmlFor="modal-sender-override" className="sr-only">
                  Nama pengirim khusus kiriman ini
                </label>
                <input
                  id="modal-sender-override"
                  type="text"
                  maxLength={60}
                  value={senderOverride}
                  onChange={(event) => {
                    setSenderOverride(event.target.value);
                    setSenderTouched(true);
                  }}
                  placeholder="Ketik nama pengirim khusus..."
                  className="min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
                />
              </div>
            ) : null}
          </div>

          {isAlreadyConfirmed ? (
            <label
              htmlFor="modal-force-send"
              className="flex min-h-[44px] items-start gap-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3.5 py-2.5 text-xs leading-relaxed font-medium text-[var(--warning-fg)]"
            >
              <input
                id="modal-force-send"
                type="checkbox"
                checked={forceSend}
                onChange={(event) => setForceSend(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span>
                Hari ini sudah tercatat absen. Saya tetap ingin mengirim pengingat ulang sekarang.
              </span>
            </label>
          ) : null}

          {feedback ? (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
                feedback.type === "error"
                  ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                  : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
              }`}
            >
              {feedback.type === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{feedback.text}</span>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary-accent inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? (
                <span>Mengirim...</span>
              ) : (
                <>
                  <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  <span>Kirim Sekarang</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
