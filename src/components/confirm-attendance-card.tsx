"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
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
        setSubmitError(body.message ?? "Konfirmasi gagal disimpan. Coba tekan tombol kembali.");
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

      setStatus("already_confirmed");
      setSubmitting(false);
    } catch {
      setSubmitError("Koneksi terputus saat menghubungi server. Periksa jaringan lalu coba lagi.");
      setSubmitting(false);
    }
  }

  if (status === "already_confirmed") {
    return (
      <section className="rounded-xl border border-[var(--success-border)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-md border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--success-fg)]">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Absen Terkonfirmasi</span>
        </div>

        <h1 className="font-display mt-4 text-2xl font-semibold text-[var(--ink)] sm:text-3xl">
          Sudah tercatat absen
        </h1>
        <p className="mt-2 text-base font-medium text-[var(--ink)]">{dateFormatted}</p>

        <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-muted)]">
          {confirmedTime ? (
            <p className="flex items-center gap-2 text-[var(--ink)]">
              <Clock className="h-4 w-4 shrink-0 text-[var(--success-fg)]" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Tercatat pada <strong className="font-mono-num">{confirmedTime}</strong>
                {confirmedBy === "dashboard_manual"
                  ? " (konfirmasi manual dashboard)"
                  : " (melalui tautan email)"}
              </span>
            </p>
          ) : null}
          <p className="mt-2 leading-relaxed">
            Pengingat lanjutan untuk tanggal ini otomatis dibatalkan. Anda dapat menutup halaman ini.
          </p>
        </div>
      </section>
    );
  }

  if (status !== "ready") {
    const titleByState: Record<Exclude<ConfirmInitialState, "ready" | "already_confirmed">, string> =
      {
        missing_params: "Tautan Konfirmasi Tidak Lengkap",
        invalid_window: "Tautan Sudah Kedaluwarsa",
        invalid_token: "Tautan Tidak Valid",
        config_error: "Layanan Belum Dikonfigurasi",
      };

    const defaultMessageByState: Record<
      Exclude<ConfirmInitialState, "ready" | "already_confirmed">,
      string
    > = {
      missing_params:
        "Parameter tanggal atau token tidak ditemukan. Buka kembali tautan langsung dari email pengingat terbaru.",
      invalid_window:
        "Konfirmasi hanya berlaku untuk jadwal hari ini atau kemarin (WIB). Jika masih perlu mencatat absen, hubungi pengirim untuk memperbarui dari dashboard.",
      invalid_token:
        "Token keamanan tidak cocok dengan tanggal yang diminta. Pastikan tautan dari email tidak terpotong.",
      config_error:
        "Konfigurasi server belum lengkap. Hubungi pengelola sistem untuk memeriksa environment variables.",
    };

    return (
      <section className="rounded-xl border border-[var(--danger-border)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--danger-fg)]">
          <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Tidak Dapat Diproses</span>
        </div>

        <h1 className="font-display mt-4 text-2xl font-semibold text-[var(--ink)]">
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
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 sm:p-8">
      <p className="font-mono-num text-xs font-medium text-[var(--accent)]">
        Konfirmasi Absen Harian (WIB)
      </p>

      <h1 className="font-display mt-2 text-2xl font-semibold leading-snug text-[var(--ink)] sm:text-3xl">
        {dateFormatted}
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">
        {partnerName ? `Halo ${partnerName}, ` : ""}tekan tombol di bawah setelah Anda selesai melakukan absen. Status akan langsung tersimpan sehingga pengingat sore dan malam hari ini otomatis dibatalkan.
      </p>

      {submitError ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 text-sm text-[var(--danger-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-lg bg-[var(--accent)] px-6 text-base font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] active:scale-[0.99] disabled:opacity-60"
      >
        <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <span>{submitting ? "Menyimpan Konfirmasi..." : "Konfirmasi: Saya Sudah Absen"}</span>
      </button>

      <p className="mt-4 text-xs leading-relaxed text-[var(--ink-muted)]">
        Halaman ini hanya membaca status saat dibuka. Data baru disimpan ketika tombol konfirmasi di atas ditekan.
      </p>
    </section>
  );
}
