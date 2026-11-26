"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
} from "lucide-react";
import {
  PinSixDotIndicator,
  sanitizeNumericPin6,
} from "@/components/ui/pin-input-dots";

type LoginViewMode = "login" | "forgot_request" | "forgot_reset";

export function LoginForm() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<LoginViewMode>("login");

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [showNewPin, setShowNewPin] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

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

  async function handleRequestOtp() {
    if (submitting || cooldownSeconds > 0) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/forgot-pin/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: { cooldownSeconds?: number; retryAfterSeconds?: number };
      };

      if (!response.ok || !body.ok) {
        if (body.data?.retryAfterSeconds) {
          setCooldownSeconds(body.data.retryAfterSeconds);
        }
        setErrorMessage(body.message ?? "Gagal mengirim kode pemulihan PIN.");
        return;
      }

      setCooldownSeconds(body.data?.cooldownSeconds ?? 60);
      setSuccessMessage(
        body.message ??
          "Kode pemulihan 6 digit telah dikirim ke email pemilik terdaftar.",
      );
      setViewMode("forgot_reset");
    } catch {
      setErrorMessage("Koneksi gagal saat mengirim kode pemulihan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPinSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!/^\d{6}$/.test(otp)) {
      setErrorMessage("Masukkan kode OTP tepat 6 digit angka.");
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setErrorMessage("PIN baru harus tepat 6 digit angka.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setErrorMessage("Konfirmasi PIN baru tidak cocok.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp, newPin, confirmNewPin }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !body.ok) {
        setErrorMessage(body.message ?? "Gagal mereset PIN.");
        return;
      }

      setPin("");
      setOtp("");
      setNewPin("");
      setConfirmNewPin("");
      setViewMode("login");
      setSuccessMessage(
        body.message ??
          "PIN 6 digit baru berhasil disimpan. Silakan masuk menggunakan PIN baru.",
      );
    } catch {
      setErrorMessage("Koneksi gagal saat menyimpan PIN baru.");
    } finally {
      setSubmitting(false);
    }
  }

  function backToLogin() {
    setViewMode("login");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  if (viewMode === "forgot_request") {
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[var(--ink)]">
                Pemulihan PIN Pemilik
              </h2>
              <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                Kode verifikasi 6 digit sekali pakai akan dikirim ke alamat email pemilik terdaftar (berlaku 10 menit).
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleRequestOtp()}
          disabled={submitting || cooldownSeconds > 0}
          className="btn-primary-accent inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:opacity-60"
        >
          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span>
            {submitting
              ? "Mengirim Kode..."
              : cooldownSeconds > 0
                ? `Tunggu ${cooldownSeconds} detik`
                : "Kirim Kode ke Email Pemilik"}
          </span>
        </button>

        <button
          type="button"
          onClick={backToLogin}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          <span>Kembali ke Login</span>
        </button>
      </div>
    );
  }

  if (viewMode === "forgot_reset") {
    return (
      <form onSubmit={handleResetPinSubmit} className="mt-5 space-y-4" noValidate>
        {successMessage ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3 text-xs leading-relaxed text-[var(--success-fg)]"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <div>
          <label htmlFor="reset-otp-input" className="block text-xs font-semibold text-[var(--ink)]">
            Kode OTP 6 Digit
          </label>
          <input
            id="reset-otp-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) => {
              setOtp(sanitizeNumericPin6(event.target.value));
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="000000"
            className="font-mono-num mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-center text-lg font-bold tracking-[0.3em] text-[var(--ink)] placeholder:tracking-normal placeholder:text-[var(--ink-muted)]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="reset-new-pin" className="block text-xs font-semibold text-[var(--ink)]">
              PIN Baru (6 Digit Angka)
            </label>
            <button
              type="button"
              onClick={() => setShowNewPin((prev) => !prev)}
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              {showNewPin ? "Sembunyikan" : "Tampilkan"}
            </button>
          </div>
          <input
            id="reset-new-pin"
            type={showNewPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={newPin}
            onChange={(event) => {
              setNewPin(sanitizeNumericPin6(event.target.value));
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Ketik 6 digit angka..."
            className="font-mono-num mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)]"
          />
          <PinSixDotIndicator length={newPin.length} />
        </div>

        <div>
          <label htmlFor="reset-confirm-pin" className="block text-xs font-semibold text-[var(--ink)]">
            Konfirmasi PIN Baru
          </label>
          <input
            id="reset-confirm-pin"
            type={showNewPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirmNewPin}
            onChange={(event) => {
              setConfirmNewPin(sanitizeNumericPin6(event.target.value));
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Ulangi 6 digit PIN baru..."
            className="font-mono-num mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)]"
          />
        </div>

        {errorMessage ? (
          <div
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
          className="btn-primary-accent inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span>{submitting ? "Menyimpan PIN..." : "Simpan PIN Baru"}</span>
        </button>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={backToLogin}
            className="inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Kembali ke Login</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRequestOtp()}
            disabled={submitting || cooldownSeconds > 0}
            className="min-h-[40px] text-xs font-semibold text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            {cooldownSeconds > 0
              ? `Kirim ulang (${cooldownSeconds}d)`
              : "Kirim Ulang Kode"}
          </button>
        </div>
      </form>
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
            setViewMode("forgot_request");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className="min-h-[36px] text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--accent)] hover:underline"
        >
          Lupa PIN?
        </button>
      </div>
    </form>
  );
}
