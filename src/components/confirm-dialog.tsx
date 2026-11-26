"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "accent" | "danger";
  busy?: boolean;
  extraContent?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  tone = "accent",
  busy = false,
  extraContent,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  const confirmStyle =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-500"
      : "btn-playful-gradient shadow-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-xs sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="confirm-dialog-title"
            className="font-display text-xl font-semibold text-[var(--ink)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Tutup dialog"
            className="-mt-1.5 -mr-1.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            <X className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        <p
          id="confirm-dialog-description"
          className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]"
        >
          {description}
        </p>

        {extraContent ? <div className="mt-4">{extraContent}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-2xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-sm font-semibold text-[var(--ink)] transition-all hover:bg-[var(--surface-muted)] active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] rounded-2xl px-5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 ${confirmStyle}`}
          >
            {busy ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
