"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  PinSixDotIndicator,
  sanitizeNumericPin6,
} from "@/components/ui/pin-input-dots";
import type { OtpPurpose } from "@/lib/types";

interface StepUpPinFlowProps {
  purpose: OtpPurpose;
  onSuccess: (message: string) => void | Promise<void>;
  onCancel?: () => void;
  onStepChange?: (step: StepNumber) => void;
}

type StepNumber = 1 | 2 | 3;

const ENDPOINTS: Record<
  OtpPurpose,
  { requestOtp: string; verifyOtp: string; commitPin: string }
> = {
  forgot_reset: {
    requestOtp: "/api/auth/forgot-pin/request",
    verifyOtp: "/api/auth/forgot-pin/verify-otp",
    commitPin: "/api/auth/forgot-pin/reset",
  },
  change_pin: {
    requestOtp: "/api/auth/change-pin/request-otp",
    verifyOtp: "/api/auth/change-pin/verify-otp",
    commitPin: "/api/auth/change-pin",
  },
};

function formatMmSs(totalSeconds: number): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.max(0, totalSeconds) % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function StepUpPinFlow({ purpose, onSuccess, onCancel, onStepChange }: StepUpPinFlowProps) {
  const [step, setStep] = useState<StepNumber>(1);
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [ticketSecondsLeft, setTicketSecondsLeft] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [showPins, setShowPins] = useState(false);

  const [busyAction, setBusyAction] = useState<"request" | "verify" | "save" | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const api = ENDPOINTS[purpose];
  const isChangePin = purpose === "change_pin";

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (step !== 3 || ticketSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setTicketSecondsLeft((prev) => {
        if (prev <= 1) {
          setStep(1);
          setVerificationToken(null);
          setCurrentPin("");
          setNewPin("");
          setConfirmNewPin("");
          setFeedback({
            type: "error",
            text: "Waktu sesi verifikasi (5 menit) telah habis. Silakan minta dan verifikasi kode OTP baru.",
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, ticketSecondsLeft]);

  async function handleRequestOtp() {
    if (busyAction || cooldownSeconds > 0) return;
    setBusyAction("request");
    setFeedback(null);

    try {
      const response = await fetch(api.requestOtp, {
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
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal mengirim kode OTP.",
        });
        return;
      }

      setOtp("");
      setVerificationToken(null);
      setTicketSecondsLeft(0);
      setCooldownSeconds(body.data?.cooldownSeconds ?? 60);
      setStep(2);
      setFeedback({
        type: "success",
        text:
          body.message ??
          "Kode OTP 6 digit telah dikirim ke email pemilik terdaftar.",
      });
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim kode OTP.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;

    if (!/^\d{6}$/.test(otp)) {
      setFeedback({
        type: "error",
        text: "Masukkan kode OTP tepat 6 digit angka.",
      });
      return;
    }

    setBusyAction("verify");
    setFeedback(null);

    try {
      const response = await fetch(api.verifyOtp, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        data?: { verified?: boolean; verificationToken?: string; expiresInSeconds?: number };
      };

      if (!response.ok || !body.ok || !body.data?.verified || !body.data?.verificationToken) {
        if (body.error === "OTP_LOCKED" || body.error === "OTP_EXPIRED") {
          setOtp("");
        }
        setFeedback({
          type: "error",
          text: body.message ?? "Kode OTP tidak valid.",
        });
        return;
      }

      setVerificationToken(body.data.verificationToken);
      setTicketSecondsLeft(body.data.expiresInSeconds ?? 300);
      setOtp("");
      setCurrentPin("");
      setNewPin("");
      setConfirmNewPin("");
      setFeedback(null);
      setStep(3);
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat memverifikasi kode OTP.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCommitPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction || !verificationToken) return;
    setFeedback(null);

    if (isChangePin && currentPin.trim().length < 4) {
      setFeedback({ type: "error", text: "Masukkan PIN saat ini minimal 4 karakter." });
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setFeedback({ type: "error", text: "PIN baru harus tepat 6 digit angka." });
      return;
    }
    if (newPin !== confirmNewPin) {
      setFeedback({ type: "error", text: "Konfirmasi PIN baru tidak cocok." });
      return;
    }
    if (isChangePin && newPin === currentPin.trim()) {
      setFeedback({
        type: "error",
        text: "PIN baru tidak boleh sama dengan PIN saat ini.",
      });
      return;
    }

    setBusyAction("save");
    try {
      const payload = isChangePin
        ? {
            verificationToken,
            currentPin: currentPin.trim(),
            newPin,
            confirmNewPin,
          }
        : {
            verificationToken,
            newPin,
            confirmNewPin,
          };

      const response = await fetch(api.commitPin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !body.ok) {
        if (body.error === "VERIFICATION_EXPIRED") {
          setStep(1);
          setVerificationToken(null);
          setTicketSecondsLeft(0);
          setCurrentPin("");
          setNewPin("");
          setConfirmNewPin("");
        }
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan PIN baru.",
        });
        return;
      }

      const successText =
        body.message ?? "PIN 6 digit baru berhasil disimpan.";
      setStep(1);
      setOtp("");
      setVerificationToken(null);
      setTicketSecondsLeft(0);
      setCurrentPin("");
      setNewPin("");
      setConfirmNewPin("");
      setFeedback({ type: "success", text: successText });
      await onSuccess(successText);
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan PIN baru.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function resetToStep1() {
    setStep(1);
    setOtp("");
    setVerificationToken(null);
    setTicketSecondsLeft(0);
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setFeedback(null);
  }

  const stepsMeta = [
    { num: 1 as const, label: "Kirim OTP" },
    { num: 2 as const, label: "Verifikasi" },
    { num: 3 as const, label: "PIN Baru" },
  ];

  return (
    <div className="space-y-4">
      {/* 3-Step Mini Stepper */}
      <ol
        aria-label="Tahapan verifikasi PIN"
        className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1.5"
      >
        {stepsMeta.map((item) => {
          const isCompleted = step > item.num;
          const isActive = step === item.num;
          return (
            <li
              key={item.num}
              className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-1.5 text-[11px] font-semibold transition-colors sm:text-xs ${
                isActive
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                  : isCompleted
                    ? "bg-[var(--success-bg)] text-[var(--success-fg)]"
                    : "text-[var(--ink-muted)]"
              }`}
            >
              <span
                className={`font-mono-num inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCompleted
                    ? "bg-emerald-600 text-white"
                    : isActive
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "bg-[var(--surface)] text-[var(--ink-muted)]"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  item.num
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </li>
          );
        })}
      </ol>

      {feedback ? (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
            feedback.type === "error"
              ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
              : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      {/* TAHAP 1: Minta OTP (Form PIN baru belum dirender) */}
      {step === 1 ? (
        <div className="space-y-3.5">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
            <div className="flex items-start gap-2.5">
              <Mail
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
                strokeWidth={2}
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                Demi keamanan, verifikasi kode OTP 6 digit dari email pemilik terlebih dahulu sebelum{" "}
                {isChangePin ? "mengganti PIN akses." : "mereset PIN akses."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRequestOtp()}
            disabled={busyAction !== null || cooldownSeconds > 0}
            className="btn-primary-accent inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-60"
          >
            <Mail className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>
              {busyAction === "request"
                ? "Mengirim kode..."
                : cooldownSeconds > 0
                  ? `Tunggu ${cooldownSeconds} detik`
                  : "Kirim Kode OTP ke Email Pemilik"}
            </span>
          </button>

          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Kembali ke Login</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* TAHAP 2: Verifikasi Kode OTP (Form PIN baru masih disembunyikan) */}
      {step === 2 ? (
        <form onSubmit={handleVerifyOtp} className="space-y-3.5" noValidate>
          <div>
            <label
              htmlFor={`stepup-otp-${purpose}`}
              className="block text-xs font-semibold text-[var(--ink)]"
            >
              Kode OTP 6 Digit
            </label>
            <input
              id={`stepup-otp-${purpose}`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={otp}
              onChange={(event) => {
                setOtp(sanitizeNumericPin6(event.target.value));
                if (feedback) setFeedback(null);
              }}
              placeholder="000000"
              disabled={busyAction !== null}
              className="font-mono-num mt-1.5 min-h-[48px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-center text-base font-bold tracking-[0.28em] text-[var(--ink)] placeholder:tracking-normal placeholder:text-[var(--ink-muted)] sm:text-lg"
            />
            <PinSixDotIndicator length={otp.length} />
          </div>

          <button
            type="submit"
            disabled={busyAction !== null || otp.length !== 6}
            className="btn-primary-accent inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>
              {busyAction === "verify" ? "Memverifikasi kode..." : "Verifikasi Kode OTP"}
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={onCancel ?? resetToStep1}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>{onCancel ? "Batal / Kembali" : "Batal"}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRequestOtp()}
              disabled={busyAction !== null || cooldownSeconds > 0}
              className="min-h-[44px] text-xs font-semibold text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              {cooldownSeconds > 0
                ? `Kirim ulang (${cooldownSeconds}d)`
                : "Kirim Ulang Kode"}
            </button>
          </div>
        </form>
      ) : null}

      {/* TAHAP 3: Form PIN Baru (Hanya dirender setelah server menerbitkan verificationToken) */}
      {step === 3 && verificationToken ? (
        <form onSubmit={handleCommitPin} className="space-y-3.5" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-xs font-semibold text-[var(--success-fg)]">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              <span>OTP Terverifikasi</span>
            </span>
            <span className="font-mono-num">
              Berlaku {formatMmSs(ticketSecondsLeft)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">
              {isChangePin
                ? "Sesi perangkat lain akan otomatis dikeluarkan."
                : "Buat PIN 6 digit angka baru kamu."}
            </span>
            <button
              type="button"
              onClick={() => setShowPins((prev) => !prev)}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface-elevated)] px-2.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              {showPins ? (
                <EyeOff className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{showPins ? "Sembunyikan" : "Lihat"}</span>
            </button>
          </div>

          {isChangePin ? (
            <div>
              <label
                htmlFor="stepup-current-pin"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                PIN Saat Ini
              </label>
              <input
                id="stepup-current-pin"
                type={showPins ? "text" : "password"}
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={64}
                value={currentPin}
                onChange={(event) => {
                  setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 64));
                  if (feedback) setFeedback(null);
                }}
                placeholder="Masukkan PIN saat ini..."
                className="font-mono-num mt-1 min-h-[46px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)] sm:text-sm"
              />
            </div>
          ) : null}

          <div className={`grid grid-cols-1 gap-3 ${isChangePin ? "sm:grid-cols-2" : ""}`}>
            <div>
              <label
                htmlFor={`stepup-new-pin-${purpose}`}
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                PIN Baru (6 Digit)
              </label>
              <input
                id={`stepup-new-pin-${purpose}`}
                type={showPins ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={newPin}
                onChange={(event) => {
                  setNewPin(sanitizeNumericPin6(event.target.value));
                  if (feedback) setFeedback(null);
                }}
                placeholder="6 digit angka"
                className="font-mono-num mt-1 min-h-[46px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)] sm:text-sm"
              />
              <PinSixDotIndicator length={newPin.length} />
            </div>

            <div>
              <label
                htmlFor={`stepup-confirm-pin-${purpose}`}
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Konfirmasi PIN Baru
              </label>
              <input
                id={`stepup-confirm-pin-${purpose}`}
                type={showPins ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={confirmNewPin}
                onChange={(event) => {
                  setConfirmNewPin(sanitizeNumericPin6(event.target.value));
                  if (feedback) setFeedback(null);
                }}
                placeholder="Ulangi 6 digit PIN"
                className="font-mono-num mt-1 min-h-[46px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base tracking-widest text-[var(--ink)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--ink-muted)] sm:text-sm"
              />
              <PinSixDotIndicator length={confirmNewPin.length} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busyAction !== null}
              className="btn-primary-accent inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>
                {busyAction === "save"
                  ? "Menyimpan..."
                  : isChangePin
                    ? "Perbarui PIN"
                    : "Simpan PIN Baru"}
              </span>
            </button>

            <button
              type="button"
              onClick={onCancel ?? resetToStep1}
              disabled={busyAction !== null}
              className="min-h-[46px] shrink-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            >
              Batal
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
