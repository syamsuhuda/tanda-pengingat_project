"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  CalendarPlus,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AttendanceTab } from "@/components/dashboard/attendance-tab";
import { ItineraryTab } from "@/components/dashboard/itinerary-tab";
import type { DashboardStatusData, FriendContact } from "@/lib/types";

type ActiveTab = "attendance" | "itinerary";

export function DashboardShell() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("attendance");
  const [statusData, setStatusData] = useState<DashboardStatusData | null>(null);
  const [contacts, setContacts] = useState<FriendContact[]>([]);
  const [contactGroups, setContactGroups] = useState<string[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadStatus = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoadingStatus(true);
      }
      setStatusError(null);

      try {
        const response = await fetch("/api/dashboard/status", {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const body = (await response.json()) as {
          ok: boolean;
          message?: string;
          data?: DashboardStatusData;
        };

        if (!response.ok || !body.ok || !body.data) {
          setStatusError(body.message ?? "Gagal memuat status dashboard dari server.");
          return;
        }

        setStatusData(body.data);
      } catch {
        setStatusError("Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba muat ulang.");
      } finally {
        setLoadingStatus(false);
        setRefreshing(false);
      }
    },
    [router],
  );

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
      // Penanganan error kontak ditampilkan langsung di tab itinerary atau modal kontak.
    }
  }, [router]);

  useEffect(() => {
    void Promise.all([loadStatus(false), loadContacts()]);
  }, [loadStatus, loadContacts]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <CalendarClock
              className="h-5 w-5 shrink-0 text-[var(--accent)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="font-display truncate text-base font-semibold leading-tight text-[var(--ink)] sm:text-lg">
                Pengingat Jadwal
              </div>
              {statusData ? (
                <p className="font-mono-num truncate text-[11px] text-[var(--ink-muted)]">
                  {statusData.todayFormatted} &middot; {statusData.nowWibTime}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--ink-muted)]">Zona waktu WIB</p>
              )}
            </div>
          </div>

          <nav
            aria-label="Navigasi utama"
            role="tablist"
            className="hidden items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1 sm:flex"
          >
            <button
              type="button"
              role="tab"
              id="tab-attendance"
              aria-selected={activeTab === "attendance"}
              aria-controls="panel-attendance"
              onClick={() => setActiveTab("attendance")}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors ${
                activeTab === "attendance"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <BellRing className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Pengingat Absen</span>
            </button>

            <button
              type="button"
              role="tab"
              id="tab-itinerary"
              aria-selected={activeTab === "itinerary"}
              aria-controls="panel-itinerary"
              onClick={() => setActiveTab("itinerary")}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors ${
                activeTab === "itinerary"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <CalendarPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Undangan & Itinerary</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void Promise.all([loadStatus(true), loadContacts()])}
              disabled={refreshing || loadingStatus}
              aria-label="Muat ulang data dashboard"
              title="Muat ulang data"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>

            <ThemeToggle />

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Keluar dari dashboard"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden md:inline">{loggingOut ? "Keluar..." : "Keluar"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="pb-mobile-nav mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        {loadingStatus && !statusData ? (
          <section
            aria-busy="true"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-8 text-center"
          >
            <RefreshCw
              className="mx-auto h-6 w-6 animate-spin text-[var(--accent)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-[var(--ink)]">
              Memuat status absen dan jadwal hari ini (WIB)...
            </p>
          </section>
        ) : statusError && !statusData ? (
          <section
            role="alert"
            className="rounded-xl border border-[var(--danger-border)] bg-[var(--surface)] p-6 sm:p-8"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger-fg)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div>
                <h1 className="font-display text-xl font-semibold text-[var(--ink)]">
                  Gagal Memuat Dashboard
                </h1>
                <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{statusError}</p>
                <button
                  type="button"
                  onClick={() => void loadStatus(false)}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>Coba Muat Ulang</span>
                </button>
              </div>
            </div>
          </section>
        ) : statusData ? (
          <>
            {statusError ? (
              <div
                role="alert"
                className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
              >
                <span>{statusError}</span>
                <button
                  type="button"
                  onClick={() => void loadStatus(true)}
                  className="min-h-[36px] shrink-0 rounded-md border border-[var(--danger-border)] px-3 text-xs font-semibold hover:opacity-85"
                >
                  Ulangi
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
                  onRefresh={() => loadStatus(true)}
                />
              ) : null}
            </div>

            <div
              id="panel-itinerary"
              role="tabpanel"
              aria-labelledby="tab-itinerary"
              hidden={activeTab !== "itinerary"}
            >
              {activeTab === "itinerary" ? (
                <ItineraryTab
                  todayWib={statusData.todayWib}
                  partnerName={statusData.partnerName}
                  partnerEmail={statusData.partnerEmail}
                  contacts={contacts}
                  contactGroups={contactGroups}
                  onContactsChanged={loadContacts}
                  onSentSuccess={() => loadStatus(true)}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </main>

      <nav
        aria-label="Navigasi ponsel"
        role="tablist"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] shadow-lg sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "attendance"}
          aria-controls="panel-attendance"
          onClick={() => setActiveTab("attendance")}
          className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-2 text-xs font-semibold transition-colors ${
            activeTab === "attendance"
              ? "border-t-2 border-[var(--accent)] text-[var(--accent)]"
              : "border-t-2 border-transparent text-[var(--ink-muted)]"
          }`}
        >
          <BellRing className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          <span>Pengingat Absen</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "itinerary"}
          aria-controls="panel-itinerary"
          onClick={() => setActiveTab("itinerary")}
          className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-2 text-xs font-semibold transition-colors ${
            activeTab === "itinerary"
              ? "border-t-2 border-[var(--accent)] text-[var(--accent)]"
              : "border-t-2 border-transparent text-[var(--ink-muted)]"
          }`}
        >
          <CalendarPlus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          <span>Undangan</span>
        </button>
      </nav>
    </div>
  );
}
