"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, MessageSquareHeart, Trash2 } from "lucide-react";
import type { CustomMessageConfig, CustomMessageScope, NotificationChannel } from "@/lib/types";

interface CustomMessageCardProps {
  customMessage: CustomMessageConfig | null;
  recipientName: string;
  channel?: NotificationChannel;
  onChanged: () => Promise<void>;
}

const PRESET_MESSAGES = [
  "Semangat jaga hari ini!",
  "Jangan lupa makan & minum air!",
  "Hati-hati di jalan ya!",
] as const;

export function CustomMessageCard({
  customMessage,
  recipientName,
  channel = "email",
  onChanged,
}: CustomMessageCardProps) {
  const [messageText, setMessageText] = useState(customMessage?.message ?? "");
  const [scope, setScope] = useState<CustomMessageScope>(
    customMessage?.scope ?? "today_only",
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isDirty) {
      setMessageText(customMessage?.message ?? "");
      setScope(customMessage?.scope ?? "today_only");
    }
  }, [customMessage?.message, customMessage?.scope, customMessage?.updatedAt, isDirty]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText.trim(),
          scope,
        }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan pesan khusus.",
        });
        return;
      }

      setIsDirty(false);
      setFeedback({
        type: "success",
        text: body.message ?? "Pesan khusus disimpan.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan pesan khusus.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "",
          scope: "today_only",
        }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menghapus pesan khusus.",
        });
        return;
      }

      setMessageText("");
      setScope("today_only");
      setIsDirty(false);
      setFeedback({
        type: "success",
        text: body.message ?? "Pesan khusus dihapus.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menghapus pesan khusus.",
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <section
      aria-labelledby="custom-message-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="custom-message-heading"
            className="font-display text-lg font-semibold text-[var(--ink)]"
          >
            Catatan Kecil untuk {recipientName}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {channel === "whatsapp"
              ? "Disisipkan ke dalam pengingat WhatsApp otomatis."
              : channel === "both"
                ? "Disisipkan ke dalam pengingat otomatis (Email & WhatsApp)."
                : "Disisipkan ke dalam pengingat otomatis (Email / WhatsApp)."}
          </p>
        </div>

        {customMessage ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--success-fg)]">
            <MessageSquareHeart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>{customMessage.scope === "today_only" ? "Hari ini" : "Aktif terus"}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Pilihan cepat pesan">
        {PRESET_MESSAGES.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setMessageText(preset);
              setIsDirty(true);
              if (feedback) setFeedback(null);
            }}
            className="min-h-[40px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--border-control)] hover:bg-[var(--surface-muted)] sm:min-h-[34px] sm:px-2.5 sm:py-1"
          >
            {preset}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="mt-3 space-y-3">
        <div>
          <label htmlFor="custom-message-textarea" className="sr-only">
            Isi pesan pribadi
          </label>
          <textarea
            id="custom-message-textarea"
            rows={2}
            maxLength={500}
            value={messageText}
            onChange={(event) => {
              setMessageText(event.target.value);
              setIsDirty(true);
            }}
            placeholder="Tulis pesan penyemangat atau pilih preset di atas..."
            className="w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
            <span>{isDirty ? "Belum disimpan" : "Tersimpan"}</span>
            <span className="font-mono-num">{messageText.length}/500</span>
          </div>
        </div>

        <fieldset>
          <legend className="sr-only">Masa berlaku pesan</legend>
          <div className="grid grid-cols-2 gap-2">
            <label
              htmlFor="scope-today-only"
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                scope === "today_only"
                  ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)]"
              }`}
            >
              <input
                id="scope-today-only"
                type="radio"
                name="custom-message-scope"
                value="today_only"
                checked={scope === "today_only"}
                onChange={() => {
                  setScope("today_only");
                  setIsDirty(true);
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Hanya hari ini</span>
            </label>

            <label
              htmlFor="scope-always"
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                scope === "always"
                  ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)]"
              }`}
            >
              <input
                id="scope-always"
                type="radio"
                name="custom-message-scope"
                value="always"
                checked={scope === "always"}
                onChange={() => {
                  setScope("always");
                  setIsDirty(true);
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>Pakai terus</span>
            </label>
          </div>
        </fieldset>

        {feedback ? (
          <div
            role={feedback.type === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || clearing}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60 sm:flex-none"
          >
            {saving ? "Menyimpan..." : "Simpan Catatan"}
          </button>

          {customMessage ? (
            <button
              type="button"
              disabled={saving || clearing}
              onClick={() => void handleClear()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 text-xs font-semibold text-[var(--danger-fg)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
              <span>{clearing ? "Hapus..." : "Hapus"}</span>
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
