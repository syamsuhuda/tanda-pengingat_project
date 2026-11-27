"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { StepUpPinFlow } from "@/components/ui/step-up-pin-flow";

interface SecurityPinModalProps {
  open: boolean;
  onClose: () => void;
  onPinUpdated: () => Promise<void>;
}

export function SecurityPinModal({
  open,
  onClose,
  onPinUpdated,
}: SecurityPinModalProps) {
  const [flowStep, setFlowStep] = useState<1 | 2 | 3>(1);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (flowStep > 1 && !confirmCloseOpen) {
      setConfirmCloseOpen(true);
      return;
    }
    setConfirmCloseOpen(false);
    setFlowStep(1);
    onClose();
  }, [flowStep, confirmCloseOpen, onClose]);

  useEffect(() => {
    if (!open) {
      setConfirmCloseOpen(false);
      setFlowStep(1);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, requestClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-pin-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-tint)] text-[var(--accent)]">
              <KeyRound className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="security-pin-modal-title"
                className="font-display text-lg font-bold text-[var(--ink)]"
              >
                Keamanan &amp; Ubah PIN
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Verifikasi OTP email pemilik sebelum mengganti PIN 6 digit.
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Tutup modal keamanan PIN"
            onClick={requestClose}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {confirmCloseOpen ? (
          <div
            role="alertdialog"
            aria-label="Konfirmasi tutup verifikasi PIN"
            className="mt-4 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3.5 text-xs text-[var(--warning-fg)]"
          >
            <p className="font-semibold">
              Verifikasi OTP/PIN sedang berlangsung. Yakin ingin menutup sekarang?
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 font-semibold text-[var(--ink)]"
              >
                Lanjutkan Verifikasi
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCloseOpen(false);
                  setFlowStep(1);
                  onClose();
                }}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[var(--ink)] px-3.5 font-semibold text-[var(--bg)]"
              >
                Tutup
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <StepUpPinFlow
            purpose="change_pin"
            onStepChange={setFlowStep}
            onSuccess={async () => {
              await onPinUpdated();
              setFlowStep(1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
