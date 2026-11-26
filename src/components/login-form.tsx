"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPin = pin.trim();
    if (cleanPin.length < 4) {
      setErrorMessage("Masukkan PIN minimal 4 karakter.");
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
        setErrorMessage(body.message ?? "PIN tidak valid. Periksa kembali PIN Anda.");
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

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
      <div>
        <label
          htmlFor="dashboard-pin"
          className="block text-sm font-semibold text-[var(--ink)]"
        >
          PIN Dashboard
        </label>
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
            placeholder="Masukkan PIN akses"
            disabled={submitting}
            aria-invalid={errorMessage ? "true" : "false"}
            aria-describedby={errorMessage ? "pin-error-text" : "pin-help-text"}
            className="font-mono-num min-h-[48px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] py-3 pr-12 pl-4 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPin((prev) => !prev)}
            aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
            className="absolute top-1/2 right-1 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          >
            {showPin ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
        <p id="pin-help-text" className="mt-2 text-xs text-[var(--ink-muted)]">
          Sesi berlaku 7 hari pada perangkat ini. Percobaan gagal dibatasi 5 kali per 15 menit.
        </p>
      </div>

      {errorMessage ? (
        <div
          id="pin-error-text"
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] active:scale-[0.99] disabled:opacity-60"
      >
        <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span>{submitting ? "Memverifikasi PIN..." : "Masuk ke Dashboard"}</span>
      </button>
    </form>
  );
}
