import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getServerSession } from "@/lib/security";
import { formatWibDateIndonesian, getTodayWibDate } from "@/lib/timezone";

export const metadata: Metadata = {
  title: "Masuk | Pengingat Jadwal",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session.authenticated) {
    redirect("/");
  }

  const todayFormatted = formatWibDateIndonesian(getTodayWibDate());

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--bg)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-rose-500/15 blur-3xl dark:bg-rose-500/20"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5 text-[var(--ink)]">
          <div className="btn-playful-gradient flex h-9 w-9 items-center justify-center rounded-2xl shadow-xs">
            <CalendarClock className="h-5 w-5" strokeWidth={2.1} aria-hidden="true" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Pengingat Jadwal
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6 sm:px-6">
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl sm:p-8">
          <span className="font-mono-num inline-block rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
            {todayFormatted} (WIB)
          </span>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Yuk, Buka Panel Kontrol!
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
            Masukkan PIN untuk cek status absen live, atur jadwal libur, dan kirim undangan seru.
          </p>

          <LoginForm />
        </section>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 py-5 text-center text-xs text-[var(--ink-muted)] sm:px-6">
        Acuan waktu sistem terkunci ke WIB (Asia/Jakarta).
      </footer>
    </div>
  );
}
