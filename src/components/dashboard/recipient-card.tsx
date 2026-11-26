"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Mail, Pencil, UserRound } from "lucide-react";
import type { ActiveRecipientConfig } from "@/lib/types";

interface RecipientCardProps {
  recipient: ActiveRecipientConfig;
  onUpdated: (next: ActiveRecipientConfig) => Promise<void>;
}

export function RecipientCard({ recipient, onUpdated }: RecipientCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(recipient.name);
  const [email, setEmail] = useState(recipient.email);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!editing) {
      setName(recipient.name);
      setEmail(recipient.email);
    }
  }, [recipient.name, recipient.email, editing]);

  const previewName = name.trim() || "Nama";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/attendance/recipient", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: ActiveRecipientConfig;
      };

      if (!response.ok || !body.ok || !body.data) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan penerima aktif.",
        });
        return;
      }

      setEditing(false);
      setFeedback({
        type: "success",
        text: body.message ?? "Penerima aktif berhasil diperbarui.",
      });
      await onUpdated(body.data);
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan data penerima.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="recipient-card-heading"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="recipient-card-heading"
            className="font-display text-xl font-semibold text-[var(--ink)]"
          >
            Penerima Aktif
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Dipakai otomatis untuk pengingat harian dan Date Itinerary.
          </p>
        </div>

        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setFeedback(null);
            }}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Ubah</span>
          </button>
        ) : null}
      </div>

      {!editing ? (
        <div className="mt-4 space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <UserRound className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{recipient.name}</span>
          </p>
          <p className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
            <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{recipient.email}</span>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5" noValidate>
          <div>
            <label
              htmlFor="recipient-name-input"
              className="block text-sm font-semibold text-[var(--ink)]"
            >
              Nama Pasangan
            </label>
            <input
              id="recipient-name-input"
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama panggilan pasangan"
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
            />
            <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
              Di email akan tertulis:{" "}
              <strong className="text-[var(--ink)]">Halo {previewName}, ...</strong>
            </p>
          </div>

          <div>
            <label
              htmlFor="recipient-email-input"
              className="block text-sm font-semibold text-[var(--ink)]"
            >
              Email Pasangan
            </label>
            <input
              id="recipient-email-input"
              type="email"
              required
              maxLength={160}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@email.com"
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setName(recipient.name);
                setEmail(recipient.email);
                setFeedback(null);
              }}
              className="min-h-[44px] rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {feedback ? (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            feedback.type === "error"
              ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
              : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}
    </section>
  );
}
