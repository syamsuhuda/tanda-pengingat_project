import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import {
  ConfirmAttendanceCard,
  type ConfirmInitialState,
} from "@/components/confirm-attendance-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { EnvConfigurationError } from "@/lib/env";
import { verifyAttendanceToken } from "@/lib/security";
import { getActiveRecipient, getAttendanceStatus } from "@/lib/store";
import {
  formatIsoToWibTime,
  formatWibDateIndonesian,
  isValidYmdDate,
  isWithinAttendanceConfirmWindow,
} from "@/lib/timezone";
import type { ConfirmedBy } from "@/lib/types";

export const metadata: Metadata = {
  title: "Konfirmasi Absen | Pengingat Jadwal",
};

export const dynamic = "force-dynamic";

interface ConfirmPageProps {
  searchParams: Promise<{ date?: string; token?: string }>;
}

// Permintaan GET ini hanya membaca status (read-only) dan tidak pernah memodifikasi Redis.
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const dateParam = typeof params.date === "string" ? params.date.trim() : "";
  const tokenParam = typeof params.token === "string" ? params.token.trim() : "";

  let initialState: ConfirmInitialState = "ready";
  let dateFormatted = "";
  let initialConfirmedTimeLabel: string | undefined;
  let initialConfirmedBy: ConfirmedBy | undefined;
  let partnerName: string | undefined;
  let errorDetail: string | undefined;

  if (!dateParam || !tokenParam) {
    initialState = "missing_params";
  } else if (!isValidYmdDate(dateParam)) {
    initialState = "invalid_window";
    errorDetail = "Format tanggal pada tautan tidak valid.";
  } else {
    dateFormatted = formatWibDateIndonesian(dateParam);

    if (!isWithinAttendanceConfirmWindow(dateParam)) {
      initialState = "invalid_window";
    } else {
      try {
        const recipient = await getActiveRecipient();
        partnerName = recipient.name;

        if (!verifyAttendanceToken(dateParam, tokenParam)) {
          initialState = "invalid_token";
        } else {
          const existing = await getAttendanceStatus(dateParam);
          if (existing) {
            initialState = "already_confirmed";
            initialConfirmedTimeLabel = formatIsoToWibTime(existing.confirmedAt);
            initialConfirmedBy = existing.confirmedBy;
          } else {
            initialState = "ready";
          }
        }
      } catch (err) {
        initialState = "config_error";
        errorDetail =
          err instanceof EnvConfigurationError
            ? err.message
            : "Gagal memeriksa status konfirmasi dari server. Coba muat ulang halaman.";
      }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5 text-[var(--ink)]">
          <CalendarClock className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Pengingat Jadwal
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <ConfirmAttendanceCard
          initialState={initialState}
          dateWib={dateParam}
          dateFormatted={dateFormatted}
          token={tokenParam}
          initialConfirmedTimeLabel={initialConfirmedTimeLabel}
          initialConfirmedBy={initialConfirmedBy}
          partnerName={partnerName}
          errorDetail={errorDetail}
        />
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 py-5 text-center text-xs text-[var(--ink-muted)] sm:px-6">
        Pengingat Absen Harian (Zona Waktu WIB / Asia/Jakarta)
      </footer>
    </div>
  );
}
