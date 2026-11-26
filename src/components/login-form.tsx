"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Delete,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import {
  PinSixDotIndicator,
  sanitizeNumericPin6,
} from "@/components/ui/pin-input-dots";
import { StepUpPinFlow } from "@/components/ui/step-up-pin-flow";

type LoginViewMode = "login" | "forgot";

export function LoginForm() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<LoginViewMode>("login");

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function submitPin(rawPin: string) {
    const cleanPin = rawPin.trim();
    if (cleanPin.length < 4) {
      setErrorMessage("Masukkan PIN minimal 4 karakter ya.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleanPin }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !body.ok) {
        setErrorMessage(body.message ?? "PIN belum cocok nih. Coba cek lagi ya.");
        setSubmitting(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrorMessage("Koneksi ke server gagal. Periksa jaringan lalu coba lagi.");
      setSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPin(pin);
  }

  function appendDigit(digit: string) {
    if (submitting || pin.length >= 6) return;
    setPin((prev) => sanitizeNumericPin6(prev + digit));
    if (errorMessage) setErrorMessage(null);
  }

  function backspaceDigit() {
    if (submitting || pin.length === 0) return;
    setPin((prev) => prev.slice(0, -1));
    if (errorMessage) setErrorMessage(null);
  }

  if (viewMode === "forgot") {
    return (
      <div className="mt-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--ink)]">
            Pemulihan PIN Pemilik
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Ikuti 3 langkah verifikasi OTP untuk membuat PIN 6 digit baru.
          </p>
        </div>

        <StepUpPinFlow
          purpose="forgot_reset"
          onSuccess={(msg) => {
            setPin("");
            setErrorMessage(null);
            setSuccessMessage(msg);
            setViewMode("login");
          }}
          onCancel={() => {
            setViewMode("login");
            setErrorMessage(null);
          }}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
      {successMessage ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3.5 text-xs leading-relaxed text-[var(--success-fg)]"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="dashboard-pin"
            className="text-sm font-semibold text-[var(--ink)]"
          >
            PIN Akses (6 Digit)
          </label>
          <button
            type="button"
            onClick={() => setShowNumpad((prev) => !prev)}
            className="min-h-[36px] text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            {showNumpad ? "Sembunyikan Numpad" : "Pakai Numpad Layar"}
          </button>
        </div>

        <div className="relative mt-2">
          <input
            id="dashboard-pin"
            name="pin"
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(event) => {
              setPin(sanitizeNumericPin6(event.target.value));
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Ketik 6 digit PIN..."
            disabled={submitting}
            aria-invalid={errorMessage ? "true" : "false"}
            aria-describedby={errorMessage ? "pin-error-text" : "pin-help-text"}
            className="font-mono-num min-h-[50px] w-full rounded-2xl border border-[var(--border-control)] bg-[var(--surface-elevated)] py-3 pr-12 pl-4 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPin((prev) => !prev)}
            aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
            className="absolute top-1/2 right-1 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          >
            {showPin ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            )}
          </button>
        </div>

        <PinSixDotIndicator length={pin.length} />

        <p id="pin-help-text" className="mt-2 text-center text-[11px] text-[var(--ink-muted)]">
          Sesi aktif 7 hari di perangkat ini. Batas salah PIN: 5 kali per 15 menit.
        </p>
      </div>

      {showNumpad ? (
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={submitting || pin.length >= 6}
              onClick={() => appendDigit(digit)}
              className="font-mono-num min-h-[46px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-base font-semibold text-[var(--ink)] transition-all hover:bg-[var(--surface-muted)] active:scale-[0.95] disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={submitting || pin.length === 0}
            onClick={() => setPin("")}
            className="min-h-[46px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-xs font-semibold text-[var(--ink-muted)] transition-all hover:bg-[var(--surface-muted)] active:scale-[0.95] disabled:opacity-40"
          >
            Hapus
          </button>
          <button
            type="button"
            disabled={submitting || pin.length >= 6}
            onClick={() => appendDigit("0")}
            className="font-mono-num min-h-[46px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-base font-semibold text-[var(--ink)] transition-all hover:bg-[var(--surface-muted)] active:scale-[0.95] disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={submitting || pin.length === 0}
            onClick={backspaceDigit}
            aria-label="Hapus satu digit"
            className="inline-flex min-h-[46px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] transition-all hover:bg-[var(--surface-muted)] active:scale-[0.95] disabled:opacity-40"
          >
            <Delete className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          id="pin-error-text"
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary-accent inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-60"
      >
        <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        <span>{submitting ? "Memeriksa PIN..." : "Masuk ke Dashboard"}</span>
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setViewMode("forgot");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className="min-h-[44px] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:underline"
        >
          Lupa PIN?
        </button>
      </div>
    </form>
  );
}
