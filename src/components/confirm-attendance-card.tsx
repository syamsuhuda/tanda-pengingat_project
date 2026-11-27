"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { formatIsoToWibTime } from "@/lib/timezone";
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
        setConfirmedTime(formatIsoToWibTime(body.data.record.confirmedAt));
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
      <section className="overflow-x-clip rounded-2xl border border-sky-500/35 bg-[var(--surface)] p-5 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <CheckCircle2
              className={`h-9 w-9 ${justCelebrated ? "animate-celebrate-pop" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </div>

          <div className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Absen Kecatat</span>
          </div>

          <h1 className="font-display mt-3 text-2xl font-bold text-[var(--ink)] sm:text-3xl">
            {partnerName ? `Oke beres, ${partnerName}!` : "Oke beres, absen udah kecatat!"}
          </h1>
          <p className="mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">{dateFormatted}</p>

          <div className="mt-5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-left text-sm text-[var(--ink-muted)]">
            {confirmedTime ? (
              <p className="flex items-center gap-2 text-[var(--ink)]">
                <Clock className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2} aria-hidden="true" />
                <span>
                  Kecatat jam <strong className="font-mono-num">{confirmedTime}</strong>
                  {confirmedBy === "dashboard_manual"
                    ? " (lewat dashboard)"
                    : " (lewat link email)"}
                </span>
              </p>
            ) : null}
            <p className="mt-2 leading-relaxed">
              Oke beres! Absen hari ini udah kecatat, jadi nggak bakal ada pengingat lagi sampai besok. Halaman ini boleh langsung ditutup ya.
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
      <section className="rounded-2xl border border-[var(--danger-border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-1 text-xs font-bold text-[var(--danger-fg)]">
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
    <section className="rounded-2xl border border-sky-500/30 bg-[var(--surface)] p-6 shadow-sm sm:p-8">
      <p className="font-mono-num text-xs font-semibold text-sky-600 dark:text-sky-400">
        Konfirmasi Absen · Waktu WIB
      </p>

      <h1 className="font-display mt-2 text-2xl font-bold leading-snug text-[var(--ink)] sm:text-3xl">
        {partnerName ? `Hai ${partnerName}, udah absen?` : "Udah absen hari ini?"}
      </h1>

      <p className="font-mono-num mt-1.5 text-sm font-semibold text-[var(--ink-muted)]">
        {dateFormatted}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
        Kalau udah beres absen, tinggal pencet tombol di bawah ya biar pengingat berikutnya hari ini nggak ke-ping lagi.
      </p>

      {submitError ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="mt-6 inline-flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-xl bg-sky-600 px-6 text-base font-bold text-white transition-colors hover:bg-sky-700 active:scale-[0.98] disabled:opacity-60"
      >
        <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
        <span>{submitting ? "Menyimpan..." : "Aku Udah Absen"}</span>
      </button>

      <p className="mt-4 text-center text-xs leading-relaxed text-[var(--ink-muted)]">
        Data baru kecatat pas tombol di atas dipencet.
      </p>
    </section>
  );
}
