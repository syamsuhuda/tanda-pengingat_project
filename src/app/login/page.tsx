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
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5 text-[var(--ink)]">
          <CalendarClock className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Pengingat Jadwal
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 sm:p-8">
          <p className="font-mono-num text-xs font-medium text-[var(--ink-muted)]">
            {todayFormatted} (WIB)
          </p>
          <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
            Buka Panel Kontrol
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
            Masukkan PIN untuk memantau status absen harian, mengatur jeda bot, dan mengirim undangan itinerary.
          </p>

          <LoginForm />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-5 text-center text-xs text-[var(--ink-muted)] sm:px-6">
        Acuan waktu sistem terkunci ke WIB (Asia/Jakarta).
      </footer>
    </div>
  );
}
