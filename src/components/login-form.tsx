"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Delete, Eye, EyeOff, Lock } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitPin(rawPin: string) {
    const cleanPin = rawPin.trim();
    if (cleanPin.length < 4) {
      setErrorMessage("Masukkan PIN minimal 4 karakter ya.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

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
    if (submitting || pin.length >= 12) return;
    setPin((prev) => prev + digit);
    if (errorMessage) setErrorMessage(null);
  }

  function backspaceDigit() {
    if (submitting || pin.length === 0) return;
    setPin((prev) => prev.slice(0, -1));
    if (errorMessage) setErrorMessage(null);
  }

  const dotSlots = Math.max(6, Math.min(pin.length, 8));

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="dashboard-pin"
            className="text-sm font-semibold text-[var(--ink)]"
          >
            PIN Akses
          </label>
          <button
            type="button"
            onClick={() => setShowNumpad((prev) => !prev)}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
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
            autoFocus
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Ketik PIN rahasia..."
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

        <div className="mt-2.5 flex items-center justify-center gap-2" aria-hidden="true">
          {Array.from({ length: dotSlots }, (_, idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`h-2.5 w-2.5 rounded-full transition-all duration-150 ${
                  filled
                    ? "scale-110 bg-[var(--accent)]"
                    : "bg-[var(--border-control)]/45"
                }`}
              />
            );
          })}
        </div>

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
              disabled={submitting}
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
            disabled={submitting}
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
    </form>
  );
}
