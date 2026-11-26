"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, MessageSquareHeart, Trash2 } from "lucide-react";
import type { CustomMessageConfig, CustomMessageScope } from "@/lib/types";

interface CustomMessageCardProps {
  customMessage: CustomMessageConfig | null;
  recipientName: string;
  onChanged: () => Promise<void>;
}

export function CustomMessageCard({
  customMessage,
  recipientName,
  onChanged,
}: CustomMessageCardProps) {
  const [messageText, setMessageText] = useState(customMessage?.message ?? "");
  const [scope, setScope] = useState<CustomMessageScope>(
    customMessage?.scope ?? "today_only",
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setMessageText(customMessage?.message ?? "");
    setScope(customMessage?.scope ?? "today_only");
  }, [customMessage?.message, customMessage?.scope, customMessage?.updatedAt]);

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

      setFeedback({
        type: "success",
        text: body.message ?? "Pesan khusus pengingat berhasil disimpan.",
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
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="custom-message-heading"
            className="font-display text-xl font-semibold text-[var(--ink)]"
          >
            Pesan Khusus Pengingat
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Sisipkan catatan hangat ke email pengingat otomatis untuk {recipientName}.
          </p>
        </div>

        {customMessage ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--success-fg)]">
            <MessageSquareHeart className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>
              {customMessage.scope === "today_only" ? "Aktif hari ini" : "Aktif terus"}
            </span>
          </span>
        ) : null}
      </div>

      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="custom-message-textarea"
            className="block text-sm font-semibold text-[var(--ink)]"
          >
            Isi pesan pribadi
          </label>
          <textarea
            id="custom-message-textarea"
            rows={3}
            maxLength={500}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Contoh: Semangat jaga paginya ya, jangan lupa sarapan."
            className="mt-1.5 w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
          />
          <div className="mt-1 flex justify-end">
            <span className="font-mono-num text-[11px] text-[var(--ink-muted)]">
              {messageText.length}/500
            </span>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-[var(--ink)]">
            Masa berlaku pesan
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              htmlFor="scope-today-only"
              className={`flex min-h-[46px] items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                scope === "today_only"
                  ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]"
              }`}
            >
              <input
                id="scope-today-only"
                type="radio"
                name="custom-message-scope"
                value="today_only"
                checked={scope === "today_only"}
                onChange={() => setScope("today_only")}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium text-[var(--ink)]">
                Hanya untuk hari ini
              </span>
            </label>

            <label
              htmlFor="scope-always"
              className={`flex min-h-[46px] items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                scope === "always"
                  ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]"
              }`}
            >
              <input
                id="scope-always"
                type="radio"
                name="custom-message-scope"
                value="always"
                checked={scope === "always"}
                onChange={() => setScope("always")}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium text-[var(--ink)]">
                Pakai terus sampai saya ubah
              </span>
            </label>
          </div>
        </fieldset>

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

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            disabled={saving || clearing}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : "Simpan Pesan"}
          </button>

          {customMessage ? (
            <button
              type="button"
              disabled={saving || clearing}
              onClick={() => void handleClear()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 text-sm font-semibold text-[var(--danger-fg)] hover:opacity-90 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>{clearing ? "Menghapus..." : "Hapus Pesan"}</span>
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
