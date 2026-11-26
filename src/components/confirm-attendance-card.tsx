"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, PartyPopper, ShieldAlert, Sparkles } from "lucide-react";
import type { ConfirmedBy } from "@/lib/types";

export type ConfirmInitialState =
  | "ready"
  | "already_confirmed"
  | "invalid_window"
  | "invalid_token"
  | "missing_params"
  | "config_error";

interface ConfirmAttendanceCardProps {
  initialState: ConfirmInitialState;
  dateWib: string;
  dateFormatted: string;
  token: string;
  initialConfirmedTimeLabel?: string;
  initialConfirmedBy?: ConfirmedBy;
  partnerName?: string;
  errorDetail?: string;
}

const CONFETTI_PARTICLES = [
  { tx: "-64px", ty: "-44px", rot: "-140deg", color: "bg-emerald-400" },
  { tx: "-32px", ty: "-66px", rot: "90deg", color: "bg-rose-400" },
  { tx: "0px", ty: "-74px", rot: "180deg", color: "bg-amber-400" },
  { tx: "36px", ty: "-62px", rot: "-110deg", color: "bg-sky-400" },
  { tx: "66px", ty: "-40px", rot: "145deg", color: "bg-violet-400" },
  { tx: "-48px", ty: "-18px", rot: "75deg", color: "bg-orange-400" },
  { tx: "52px", ty: "-16px", rot: "-85deg", color: "bg-emerald-300" },
] as const;

export function ConfirmAttendanceCard({
  initialState,
  dateWib,
  dateFormatted,
  token,
  initialConfirmedTimeLabel,
  initialConfirmedBy,
  partnerName,
  errorDetail,
}: ConfirmAttendanceCardProps) {
  const [status, setStatus] = useState<ConfirmInitialState>(initialState);
  const [justCelebrated, setJustCelebrated] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState<string | undefined>(
    initialConfirmedTimeLabel,
  );
  const [confirmedBy, setConfirmedBy] = useState<ConfirmedBy | undefined>(initialConfirmedBy);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateWib, token }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: {
          record?: {
            confirmedAt: string;
            confirmedBy: ConfirmedBy;
          };
        };
      };

      if (!response.ok || !body.ok) {
        setSubmitError(body.message ?? "Konfirmasi gagal disimpan. Coba tekan tombol lagi ya.");
        setSubmitting(false);
        return;
      }

      if (body.data?.record?.confirmedAt) {
        const parsed = new Date(body.data.record.confirmedAt);
        const formatted = new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(parsed);
        setConfirmedTime(`${formatted.replace(".", ":")} WIB`);
        setConfirmedBy(body.data.record.confirmedBy);
      }

      setJustCelebrated(true);
      setStatus("already_confirmed");
      setSubmitting(false);
    } catch {
      setSubmitError("Koneksi terputus saat menghubungi server. Periksa jaringan lalu coba lagi.");
      setSubmitting(false);
    }
  }

  if (status === "already_confirmed") {
    return (
      <section className="relative overflow-hidden rounded-3xl border border-[var(--success-border)] bg-[var(--surface)] p-6 shadow-2xl sm:p-8">
        <div className="relative flex flex-col items-center text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--success-bg)] text-[var(--success-fg)]">
            <CheckCircle2
              className={`h-9 w-9 ${justCelebrated ? "animate-celebrate-pop" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            {justCelebrated
              ? CONFETTI_PARTICLES.map((p, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    style={
                      {
                        "--tx": p.tx,
                        "--ty": p.ty,
                        "--rot": p.rot,
                      } as React.CSSProperties
                    }
                    className={`animate-confetti-piece pointer-events-none absolute h-2.5 w-2.5 rounded-sm ${p.color}`}
                  />
                ))
              : null}
          </div>

          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-1 text-xs font-bold text-[var(--success-fg)]">
            <PartyPopper className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Absen Tercatat!</span>
          </div>

          <h1 className="font-display mt-3 text-2xl font-bold text-[var(--ink)] sm:text-3xl">
            {partnerName ? `Mantap, ${partnerName}!` : "Yeay, sudah tercatat absen!"}
          </h1>
          <p className="mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">{dateFormatted}</p>

          <div className="mt-5 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-left text-sm text-[var(--ink-muted)]">
            {confirmedTime ? (
              <p className="flex items-center gap-2 text-[var(--ink)]">
                <Clock className="h-4 w-4 shrink-0 text-[var(--success-fg)]" strokeWidth={2} aria-hidden="true" />
                <span>
                  Tercatat pukul <strong className="font-mono-num">{confirmedTime}</strong>
                  {confirmedBy === "dashboard_manual"
                    ? " (via dashboard)"
                    : " (via tautan email)"}
                </span>
              </p>
            ) : null}
            <p className="mt-2 leading-relaxed">
              Pengingat sore dan malam hari ini otomatis dimatikan supaya kamu bisa tenang beraktivitas. Kamu boleh tutup halaman ini sekarang.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (status !== "ready") {
    const titleByState: Record<Exclude<ConfirmInitialState, "ready" | "already_confirmed">, string> =
      {
        missing_params: "Tautan Konfirmasi Kurang Lengkap",
        invalid_window: "Tautan Sudah Lewat Masa Berlaku",
        invalid_token: "Tautan Tidak Valid",
        config_error: "Layanan Belum Siap",
      };

    const defaultMessageByState: Record<
      Exclude<ConfirmInitialState, "ready" | "already_confirmed">,
      string
    > = {
      missing_params:
        "Parameter tanggal atau token tidak ditemukan. Buka kembali tautan langsung dari email pengingat terbaru ya.",
      invalid_window:
        "Konfirmasi hanya berlaku untuk jadwal hari ini atau kemarin (WIB). Kalau masih perlu dicatat, minta pengirim menandainya dari dashboard.",
      invalid_token:
        "Token keamanan tidak cocok dengan tanggal yang diminta. Pastikan tautan dari email tidak terpotong.",
      config_error:
        "Konfigurasi server belum lengkap. Hubungi pengelola untuk memeriksa environment variables.",
    };

    return (
      <section className="rounded-3xl border border-[var(--danger-border)] bg-[var(--surface)] p-6 shadow-2xl sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-1.5 text-xs font-bold text-[var(--danger-fg)]">
          <ShieldAlert className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span>Belum Bisa Diproses</span>
        </div>

        <h1 className="font-display mt-4 text-2xl font-bold text-[var(--ink)]">
          {titleByState[status]}
        </h1>
        {dateFormatted ? (
          <p className="mt-1 text-sm font-medium text-[var(--ink-muted)]">{dateFormatted}</p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
          {errorDetail ?? defaultMessageByState[status]}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl sm:p-8">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-tint)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        <span>Konfirmasi Absen Harian</span>
      </div>

      <h1 className="font-display mt-3 text-2xl font-bold leading-snug text-[var(--ink)] sm:text-3xl">
        {partnerName ? `Hai ${partnerName}, sudah absen?` : "Sudah absen hari ini?"}
      </h1>

      <p className="font-mono-num mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">
        {dateFormatted} (WIB)
      </p>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
        Tekan tombol di bawah setelah kamu selesai absen ya. Status akan langsung tersimpan dan pengingat berikutnya hari ini otomatis dimatikan.
      </p>

      {submitError ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="btn-playful-gradient mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full px-6 text-base font-bold shadow-lg transition-all active:scale-[0.97] disabled:opacity-60"
      >
        <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
        <span>{submitting ? "Menyimpan..." : "Yeay, Aku Sudah Absen!"}</span>
      </button>

      <p className="mt-4 text-center text-xs leading-relaxed text-[var(--ink-muted)]">
        Aman dari pemindai link email: data baru tercatat ketika tombol di atas ditekan.
      </p>
    </section>
  );
}
