"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AttendanceTab } from "@/components/dashboard/attendance-tab";
import { ItineraryTab } from "@/components/dashboard/itinerary-tab";
import {
  useLiveDashboardStatus,
  type ExternalDashboardEvent,
  type LiveConnectionState,
} from "@/hooks/useLiveDashboardStatus";
import type { ActiveRecipientConfig, FriendContact } from "@/lib/types";

type ActiveTab = "attendance" | "itinerary";

interface LiveToastItem {
  id: string;
  text: string;
}

function formatRelativeSync(lastSyncedAt: number | null, nowMs: number): string {
  if (!lastSyncedAt) return "Menghubungkan...";
  const diffSec = Math.max(0, Math.floor((nowMs - lastSyncedAt) / 1000));
  if (diffSec < 5) return "Baru saja";
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin} mnt lalu`;
}

const CONNECTION_META: Record<
  LiveConnectionState,
  { label: string; dotClass: string; badgeClass: string }
> = {
  live: {
    label: "Live",
    dotClass: "bg-emerald-400",
    badgeClass:
      "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]",
  },
  reconnecting: {
    label: "Menyambung...",
    dotClass: "bg-amber-400",
    badgeClass:
      "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  },
  offline: {
    label: "Offline",
    dotClass: "bg-slate-400",
    badgeClass:
      "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--ink-muted)]",
  },
};

export function DashboardShell() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("attendance");
  const [contacts, setContacts] = useState<FriendContact[]>([]);
  const [contactGroups, setContactGroups] = useState<string[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toasts, setToasts] = useState<LiveToastItem[]>([]);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (text: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [{ id, text }, ...prev].slice(0, 3));
      const timer = setTimeout(() => {
        dismissToast(id);
      }, 6000);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const handleExternalEvent = useCallback(
    (event: ExternalDashboardEvent) => {
      if (event.kind === "attendance_confirmed") {
        pushToast(`${event.partnerName} baru saja mengonfirmasi absen hari ini!`);
      } else if (event.kind === "stage_sent") {
        pushToast(`${event.label} (${event.scheduledTimeWib}) baru saja terkirim.`);
      } else if (event.kind === "date_rollover") {
        pushToast(`Hari berganti ke ${event.newDateFormatted}. Status hari baru dimuat.`);
      }
    },
    [pushToast],
  );

  const {
    data: statusData,
    isInitialLoading,
    isSyncing,
    error: statusError,
    connectionState,
    lastSyncedAt,
    triggerRefresh,
    updateRecipientLocally,
  } = useLiveDashboardStatus({
    onUnauthorized: handleUnauthorized,
    onExternalEvent: handleExternalEvent,
  });

  useEffect(() => {
    setNowTickMs(Date.now());
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        setNowTickMs(Date.now());
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  const loadContacts = useCallback(async () => {
    try {
      const response = await fetch("/api/contacts", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const body = (await response.json()) as {
        ok: boolean;
        data?: { contacts: FriendContact[]; groups: string[] };
      };
      if (response.ok && body.ok && body.data) {
        setContacts(body.data.contacts);
        setContactGroups(body.data.groups);
      }
    } catch {
      // Penanganan error kontak ditampilkan di tab itinerary atau modal kontak.
    }
  }, [router]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const handleRecipientUpdated = useCallback(
    async (nextRecipient: ActiveRecipientConfig) => {
      updateRecipientLocally(nextRecipient);
      await triggerRefresh(true, true);
    },
    [triggerRefresh, updateRecipientLocally],
  );

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const connMeta = CONNECTION_META[connectionState];
  const syncLabel = formatRelativeSync(lastSyncedAt, nowTickMs);

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <header
        className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-tint)] text-[var(--accent)]">
              <CalendarClock className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display truncate text-base font-bold leading-tight text-[var(--ink)] sm:text-lg">
                  Pengingat Jadwal
                </span>
                <span
                  aria-live="polite"
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${connMeta.badgeClass}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${connMeta.dotClass}`}
                  />
                  <span>{connMeta.label}</span>
                </span>
              </div>
              <p className="font-mono-num truncate text-[11px] text-[var(--ink-muted)]">
                {statusData ? `${statusData.todayFormatted} · ${statusData.nowWibTime}` : "WIB"}
                <span className="hidden font-sans md:inline"> · Sinkron {syncLabel}</span>
              </p>
            </div>
          </div>

          <nav
            aria-label="Navigasi utama"
            role="tablist"
            className="hidden items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1 sm:flex"
          >
            <button
              type="button"
              role="tab"
              id="tab-attendance"
              aria-selected={activeTab === "attendance"}
              aria-controls="panel-attendance"
              onClick={() => setActiveTab("attendance")}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                activeTab === "attendance"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <BellRing
                className={`h-4 w-4 ${activeTab === "attendance" ? "text-[var(--accent)]" : ""}`}
                strokeWidth={2}
                aria-hidden="true"
              />
              <span>Kontrol Absen</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-itinerary"
              aria-selected={activeTab === "itinerary"}
              aria-controls="panel-itinerary"
              onClick={() => setActiveTab("itinerary")}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                activeTab === "itinerary"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <CalendarPlus
                className={`h-4 w-4 ${activeTab === "itinerary" ? "text-[var(--accent)]" : ""}`}
                strokeWidth={2}
                aria-hidden="true"
              />
              <span>Undangan &amp; Itinerary</span>
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => void Promise.all([triggerRefresh(true, true), loadContacts()])}
              disabled={isSyncing || isInitialLoading}
              aria-label="Muat ulang data dashboard"
              title={`Sinkron: ${syncLabel}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.97] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isSyncing ? "animate-spin text-[var(--accent)]" : ""}`}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </button>

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Keluar dari dashboard"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.97] disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              <span className="hidden md:inline">{loggingOut ? "Keluar..." : "Keluar"}</span>
            </button>
          </div>
        </div>
      </header>

      {toasts.length > 0 ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex w-[calc(100vw-2rem)] max-w-md flex-col gap-2 sm:inset-x-auto sm:right-6 sm:left-auto sm:w-auto"
          style={{ top: "calc(4rem + env(safe-area-inset-top, 0px))" }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[var(--success-border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--ink)] shadow-xl"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-fg)]"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="flex-1">{toast.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="-mt-1 -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <main className="pb-mobile-nav mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-6">
        {isInitialLoading && !statusData ? (
          <section
            aria-busy="true"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-10 text-center"
          >
            <RefreshCw
              className="mx-auto h-6 w-6 animate-spin text-[var(--accent)]"
              strokeWidth={2}
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-[var(--ink)]">
              Menyiapkan status hari ini (WIB)...
            </p>
          </section>
        ) : statusError && !statusData ? (
          <section
            role="alert"
            className="rounded-2xl border border-[var(--danger-border)] bg-[var(--surface)] p-6 sm:p-8"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger-fg)]"
                strokeWidth={2}
                aria-hidden="true"
              />
              <div>
                <h1 className="font-display text-xl font-semibold text-[var(--ink)]">
                  Gagal Memuat Dashboard
                </h1>
                <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{statusError}</p>
                <button
                  type="button"
                  onClick={() => void triggerRefresh(true, true)}
                  className="btn-primary-accent mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  <span>Coba Muat Ulang</span>
                </button>
              </div>
            </div>
          </section>
        ) : statusData ? (
          <>
            <div className="mb-3 flex items-center justify-between text-[11px] text-[var(--ink-muted)] md:hidden">
              <span>Sinkronisasi live</span>
              <span className="font-mono-num">{syncLabel}</span>
            </div>

            {statusError ? (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-2.5 text-xs font-medium text-[var(--warning-fg)]"
              >
                <span>{statusError}</span>
                <button
                  type="button"
                  onClick={() => void triggerRefresh(true, true)}
                  className="min-h-[34px] shrink-0 rounded-lg border border-[var(--warning-border)] px-3 font-semibold hover:opacity-85"
                >
                  Coba Sekarang
                </button>
              </div>
            ) : null}

            <div
              id="panel-attendance"
              role="tabpanel"
              aria-labelledby="tab-attendance"
              hidden={activeTab !== "attendance"}
            >
              {activeTab === "attendance" ? (
                <AttendanceTab
                  data={statusData}
                  onRefresh={() => triggerRefresh(true, true)}
                  onRecipientUpdated={handleRecipientUpdated}
                />
              ) : null}
            </div>

            <div
              id="panel-itinerary"
              role="tabpanel"
              aria-labelledby="tab-itinerary"
              hidden={activeTab !== "itinerary"}
            >
              <ItineraryTab
                todayWib={statusData.todayWib}
                partnerName={statusData.recipient.name}
                partnerEmail={statusData.recipient.email}
                defaultSenderName={statusData.senderName}
                contacts={contacts}
                contactGroups={contactGroups}
                onContactsChanged={loadContacts}
                onSentSuccess={() => triggerRefresh(true, true)}
              />
            </div>
          </>
        ) : null}
      </main>

      <nav
        aria-label="Navigasi ponsel"
        role="tablist"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "attendance"}
          aria-controls="panel-attendance"
          onClick={() => setActiveTab("attendance")}
          className={`flex min-h-[60px] flex-col items-center justify-center gap-1 border-t-2 px-2 text-xs font-semibold transition-colors ${
            activeTab === "attendance"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--ink-muted)]"
          }`}
        >
          <BellRing className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          <span>Kontrol Absen</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "itinerary"}
          aria-controls="panel-itinerary"
          onClick={() => setActiveTab("itinerary")}
          className={`flex min-h-[60px] flex-col items-center justify-center gap-1 border-t-2 px-2 text-xs font-semibold transition-colors ${
            activeTab === "itinerary"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--ink-muted)]"
          }`}
        >
          <CalendarPlus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          <span>Undangan</span>
        </button>
      </nav>
    </div>
  );
}
