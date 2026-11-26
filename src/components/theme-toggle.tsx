"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("pj_theme", next);
    } catch {
      // Abaikan jika penyimpanan lokal dibatasi browser.
    }
  }

  const label = mounted
    ? theme === "dark"
      ? "Ganti ke mode terang"
      : "Ganti ke mode gelap"
    : "Ubah tema tampilan";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.97]"
    >
      {mounted && theme === "light" ? (
        <Moon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Sun className="h-4 w-4 text-amber-300" strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}
