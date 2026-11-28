"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActiveRecipientConfig,
  AttendanceStage,
  DashboardStatusData,
  DashboardStatusResponseData,
} from "@/lib/types";

const BASE_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_INTERVAL_MS = 60_000;
const REVALIDATE_COOLDOWN_MS = 2_000;

export type LiveConnectionState = "live" | "reconnecting" | "offline";

export type ExternalDashboardEvent =
  | { kind: "attendance_confirmed"; partnerName: string; confirmedAt: string }
  | { kind: "stage_sent"; stage: AttendanceStage; label: string; scheduledTimeWib: string }
  | { kind: "date_rollover"; newDateFormatted: string };

interface UseLiveDashboardStatusOptions {
  onUnauthorized: () => void;
  onExternalEvent?: (event: ExternalDashboardEvent) => void;
}

export interface UseLiveDashboardStatusResult {
  data: DashboardStatusData | null;
  isInitialLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  connectionState: LiveConnectionState;
  lastSyncedAt: number | null;
  triggerRefresh: (forceFull?: boolean, silentEvents?: boolean) => Promise<void>;
  updateRecipientLocally: (nextRecipient: ActiveRecipientConfig) => void;
}

export function useLiveDashboardStatus({
  onUnauthorized,
  onExternalEvent,
}: UseLiveDashboardStatusOptions): UseLiveDashboardStatusResult {
  const [data, setData] = useState<DashboardStatusData | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "live",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const dataRef = useRef<DashboardStatusData | null>(null);
  const versionRef = useRef<string | null>(null);
  const clientDateRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef(BASE_POLL_INTERVAL_MS);
  const consecutiveFailuresRef = useRef(0);
  const lastAttemptAtRef = useRef(0);
  const stoppedRef = useRef(false);
  const mountedRef = useRef(true);

  const onUnauthorizedRef = useRef(onUnauthorized);
  const onExternalEventRef = useRef(onExternalEvent);
  onUnauthorizedRef.current = onUnauthorized;
  onExternalEventRef.current = onExternalEvent;

  const clearScheduledTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback(
    (runPollFn: () => void) => {
      clearScheduledTimer();
      if (stoppedRef.current || !mountedRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      timerRef.current = setTimeout(() => {
        runPollFn();
      }, backoffDelayRef.current);
    },
    [clearScheduledTimer],
  );

  const performSync = useCallback(
    async (options?: { forceFull?: boolean; silentEvents?: boolean; manual?: boolean }) => {
      if (stoppedRef.current || !mountedRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setConnectionState("offline");
        clearScheduledTimer();
        return;
      }

      const nowMs = Date.now();
      if (!options?.manual && !options?.forceFull) {
        if (nowMs - lastAttemptAtRef.current < REVALIDATE_COOLDOWN_MS && dataRef.current !== null) {
          return;
        }
      }

      if (inFlightRef.current) {
        if (!options?.forceFull) {
          return;
        }
        abortControllerRef.current?.abort();
      }

      inFlightRef.current = true;
      lastAttemptAtRef.current = nowMs;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (dataRef.current === null) {
        setIsInitialLoading(true);
      } else {
        setIsSyncing(true);
      }

      try {
        const params = new URLSearchParams();
        if (!options?.forceFull && versionRef.current && clientDateRef.current) {
          params.set("sinceVersion", versionRef.current);
          params.set("clientDate", clientDateRef.current);
        }

        const queryString = params.toString();
        const url = queryString ? `/api/dashboard/status?${queryString}` : "/api/dashboard/status";

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!mountedRef.current || stoppedRef.current) return;

        if (response.status === 401) {
          stoppedRef.current = true;
          clearScheduledTimer();
          onUnauthorizedRef.current();
          return;
        }

        if (response.status >= 500) {
          consecutiveFailuresRef.current += 2;
          throw new Error("Server sedang mengalami gangguan sementara (5xx).");
        }

        const body = (await response.json()) as {
          ok: boolean;
          message?: string;
          data?: DashboardStatusResponseData;
        };

        if (!response.ok || !body.ok || !body.data) {
          throw new Error(body.message ?? "Gagal menyinkronkan status dashboard.");
        }

        const payload = body.data;
        consecutiveFailuresRef.current = 0;
        backoffDelayRef.current = BASE_POLL_INTERVAL_MS;
        setConnectionState("live");
        setError(null);
        setLastSyncedAt(Date.now());

        if (payload.unchanged) {
          versionRef.current = payload.version;
          clientDateRef.current = payload.todayWib;
          return;
        }

        const prevData = dataRef.current;
        dataRef.current = payload;
        versionRef.current = payload.version;
        clientDateRef.current = payload.todayWib;
        setData(payload);

        if (prevData && !options?.silentEvents && onExternalEventRef.current) {
          if (prevData.todayWib !== payload.todayWib) {
            onExternalEventRef.current({
              kind: "date_rollover",
              newDateFormatted: payload.todayFormatted,
            });
          } else {
            if (prevData.attendance === null && payload.attendance !== null) {
              onExternalEventRef.current({
                kind: "attendance_confirmed",
                partnerName: payload.recipient.name,
                confirmedAt: payload.attendance.confirmedAt,
              });
            }

            for (const nextStage of payload.timeline) {
              const prevStage = prevData.timeline.find((s) => s.stage === nextStage.stage);
              if (prevStage && prevStage.status !== "sent" && nextStage.status === "sent") {
                onExternalEventRef.current({
                  kind: "stage_sent",
                  stage: nextStage.stage,
                  label: nextStage.label,
                  scheduledTimeWib: nextStage.scheduledTimeWib,
                });
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (!mountedRef.current || stoppedRef.current) return;

        consecutiveFailuresRef.current += 1;
        const isOfflineNow = typeof navigator !== "undefined" && !navigator.onLine;
        if (isOfflineNow || consecutiveFailuresRef.current >= 2) {
          setConnectionState("offline");
        } else {
          setConnectionState("reconnecting");
        }
        backoffDelayRef.current = Math.min(
          backoffDelayRef.current * 2,
          MAX_POLL_INTERVAL_MS,
        );

        const errMessage =
          err instanceof Error
            ? err.message
            : "Tidak dapat terhubung ke server. Menunggu koneksi pulih.";
        setError(errMessage);
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          inFlightRef.current = false;
        }
        if (mountedRef.current) {
          setIsInitialLoading(false);
          setIsSyncing(false);
        }
      }
    },
    [clearScheduledTimer],
  );

  const pollCycleRef = useRef<() => void>(() => {});
  pollCycleRef.current = () => {
    void performSync({ forceFull: false, silentEvents: false }).finally(() => {
      scheduleNextPoll(() => pollCycleRef.current());
    });
  };

  const triggerRefresh = useCallback(
    async (forceFull = true, silentEvents = true) => {
      clearScheduledTimer();
      await performSync({ forceFull, silentEvents, manual: true });
      scheduleNextPoll(() => pollCycleRef.current());
    },
    [clearScheduledTimer, performSync, scheduleNextPoll],
  );

  const updateRecipientLocally = useCallback((nextRecipient: ActiveRecipientConfig) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated: DashboardStatusData = {
        ...prev,
        recipient: nextRecipient,
        partnerName: nextRecipient.name,
        partnerEmail: nextRecipient.email,
      };
      dataRef.current = updated;
      return updated;
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    stoppedRef.current = false;

    void performSync({ forceFull: true, silentEvents: true, manual: true }).finally(() => {
      scheduleNextPoll(() => pollCycleRef.current());
    });

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void performSync({ forceFull: false, silentEvents: false }).finally(() => {
          scheduleNextPoll(() => pollCycleRef.current());
        });
      } else {
        clearScheduledTimer();
      }
    }

    function handleWindowFocus() {
      if (document.visibilityState === "visible") {
        void performSync({ forceFull: false, silentEvents: false }).finally(() => {
          scheduleNextPoll(() => pollCycleRef.current());
        });
      }
    }

    function handleOnline() {
      backoffDelayRef.current = BASE_POLL_INTERVAL_MS;
      setConnectionState("live");
      void performSync({ forceFull: false, silentEvents: false }).finally(() => {
        scheduleNextPoll(() => pollCycleRef.current());
      });
    }

    function handleOffline() {
      clearScheduledTimer();
      setConnectionState("offline");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mountedRef.current = false;
      stoppedRef.current = true;
      clearScheduledTimer();
      abortControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [clearScheduledTimer, performSync, scheduleNextPoll]);

  return {
    data,
    isInitialLoading,
    isSyncing,
    error,
    connectionState,
    lastSyncedAt,
    triggerRefresh,
    updateRecipientLocally,
  };
}
