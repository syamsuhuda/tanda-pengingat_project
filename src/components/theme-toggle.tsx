"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

function applyThemeToDocument(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
}

function readPersistedOrDomTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Abaikan jika localStorage dibatasi browser.
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const actual = readPersistedOrDomTheme();
    applyThemeToDocument(actual);
    setTheme(actual);
    setMounted(true);

    function handleStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next: ThemeMode = event.newValue === "light" ? "light" : "dark";
      applyThemeToDocument(next);
      setTheme(next);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  function toggleTheme() {
    const current = readPersistedOrDomTheme();
    const next: ThemeMode = current === "dark" ? "light" : "dark";
    applyThemeToDocument(next);
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
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
        <Moon className="h-4 w-4 text-sky-700" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Sun className="h-4 w-4 text-sky-300" strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}
