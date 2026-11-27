"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  Lock,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ContactsModal } from "@/components/dashboard/contacts-modal";
import { ItineraryPreview } from "@/components/dashboard/itinerary-preview";
import { TimePicker24h } from "@/components/ui/time-picker-24h";
import {
  DATE_CATEGORY_PRESETS,
  DEFAULT_CATEGORY_BY_MODE,
  EVENT_CATEGORY_PRESETS,
  generateItineraryIntroMessage,
} from "@/lib/itinerary-copy";
import {
  formatDurationIndonesian,
  isValidHmTime,
  isValidYmdDate,
  resolveWibSessionUtcRange,
  suggestNextSessionSlot,
} from "@/lib/timezone";
import type {
  AlarmMinutes,
  FriendContact,
  IcsBundleMode,
  ItineraryMessageTone,
  ItinerarySessionInput,
  NormalizedItineraryMode,
} from "@/lib/types";

interface ItineraryTabProps {
  todayWib: string;
  defaultSenderName: string;
  partnerName: string;
  partnerEmail: string;
  contacts: FriendContact[];
  contactGroups: string[];
  onContactsChanged: () => Promise<void>;
  onSentSuccess: () => Promise<void>;
}

const MAX_RECIPIENTS = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SessionDraft extends ItinerarySessionInput {
  draftId: string;
}

interface ModeDraft {
  subject: string;
  senderName: string;
  senderDirty: boolean;
  categoryLabel: string;
  categoryIsCustom: boolean;
  messageTone: ItineraryMessageTone;
  introMessage: string;
  introEditedManually: boolean;
  alarmMinutes: AlarmMinutes;
  icsMode: IcsBundleMode;
  sessions: SessionDraft[];
  activeSessionIndex: number;
  selectedContactIds: string[];
  manualEmails: string[];
  manualEmailInput: string;
  manualEmailError: string | null;
}

type FeedbackState = {
  type: "success" | "error";
  text: string;
} | null;

const TONE_LABELS: Record<ItineraryMessageTone, string> = {
  formal: "Formal",
  natural: "Natural",
  casual: "Santai",
  custom: "Tulis Sendiri",
};

function createInitialSession(dateWib: string, suffix = 1): SessionDraft {
  return {
    draftId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${suffix}`,
    title: "",
    date: dateWib,
    startTime: "19:00",
    endTime: "20:30",
    locationName: "",
    mapsUrl: "",
    description: "",
  };
}

function createInitialDraft(
  mode: NormalizedItineraryMode,
  todayWib: string,
  defaultSenderName: string,
  partnerName: string,
): ModeDraft {
  const defaultCategory = DEFAULT_CATEGORY_BY_MODE[mode];
  const initialSender = mode === "date" ? defaultSenderName : "";
  return {
    subject: "",
    senderName: initialSender,
    senderDirty: false,
    categoryLabel: defaultCategory,
    categoryIsCustom: false,
    messageTone: "natural",
    introMessage: generateItineraryIntroMessage({
      mode,
      tone: "natural",
      senderName: initialSender,
      recipientName: mode === "date" ? partnerName : undefined,
      categoryLabel: defaultCategory,
      sessionCount: 1,
    }),
    introEditedManually: false,
    alarmMinutes: 30,
    icsMode: "combined",
    sessions: [createInitialSession(todayWib, 1)],
    activeSessionIndex: 0,
    selectedContactIds: [],
    manualEmails: [],
    manualEmailInput: "",
    manualEmailError: null,
  };
}

export function ItineraryTab({
  todayWib,
  defaultSenderName,
  partnerName,
  partnerEmail,
  contacts,
  contactGroups,
  onContactsChanged,
  onSentSuccess,
}: ItineraryTabProps) {
  const [mode, setMode] = useState<NormalizedItineraryMode>("date");
  const [drafts, setDrafts] = useState<Record<NormalizedItineraryMode, ModeDraft>>(() => ({
    date: createInitialDraft("date", todayWib, defaultSenderName, partnerName),
    event: createInitialDraft("event", todayWib, defaultSenderName, partnerName),
  }));
  const [feedbackByMode, setFeedbackByMode] = useState<
    Record<NormalizedItineraryMode, FeedbackState>
  >({
    date: null,
    event: null,
  });

  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("ALL");
  const [submitting, setSubmitting] = useState(false);
  const [eventSenderError, setEventSenderError] = useState<string | null>(null);
  const eventSenderInputRef = useRef<HTMLInputElement>(null);

  const activeDraft = drafts[mode];
  const feedback = feedbackByMode[mode];
  const safeSessionIndex = Math.min(
    Math.max(activeDraft.activeSessionIndex, 0),
    Math.max(activeDraft.sessions.length - 1, 0),
  );
  const activeSession = activeDraft.sessions[safeSessionIndex] ?? activeDraft.sessions[0];

  function updateDraft(
    targetMode: NormalizedItineraryMode,
    updater: (prev: ModeDraft) => ModeDraft,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [targetMode]: updater(prev[targetMode]),
    }));
  }

  function setModeFeedback(targetMode: NormalizedItineraryMode, next: FeedbackState) {
    setFeedbackByMode((prev) => ({
      ...prev,
      [targetMode]: next,
    }));
  }

  // Sinkronkan defaultSenderName HANYA untuk draft mode date yang belum diubah manual.
  useEffect(() => {
    setDrafts((prev) => {
      const d = prev.date;
      if (d.senderDirty || d.senderName === defaultSenderName) {
        return prev;
      }
      return {
        ...prev,
        date: {
          ...d,
          senderName: defaultSenderName,
          introMessage:
            !d.introEditedManually && d.messageTone !== "custom"
              ? generateItineraryIntroMessage({
                  mode: "date",
                  tone: d.messageTone,
                  senderName: defaultSenderName,
                  recipientName: partnerName,
                  categoryLabel: d.categoryLabel,
                  sessionCount: d.sessions.length,
                })
              : d.introMessage,
        },
      };
    });
  }, [defaultSenderName, partnerName]);

  // Sinkronkan pesan pembuka mode date jika partnerName berubah dan user belum edit manual.
  useEffect(() => {
    setDrafts((prev) => {
      const d = prev.date;
      if (d.introEditedManually || d.messageTone === "custom") return prev;
      const regenerated = generateItineraryIntroMessage({
        mode: "date",
        tone: d.messageTone,
        senderName: d.senderName.trim() || defaultSenderName,
        recipientName: partnerName,
        categoryLabel: d.categoryLabel,
        sessionCount: d.sessions.length,
      });
      if (regenerated === d.introMessage) return prev;
      return {
        ...prev,
        date: {
          ...d,
          introMessage: regenerated,
        },
      };
    });
  }, [partnerName, defaultSenderName]);

  useEffect(() => {
    if (!mobilePreviewOpen && !contactPickerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobilePreviewOpen(false);
        setContactPickerOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobilePreviewOpen, contactPickerOpen]);

  const visibleContacts = useMemo(() => {
    if (activeGroupFilter === "ALL") return contacts;
    return contacts.filter((c) => c.group === activeGroupFilter);
  }, [contacts, activeGroupFilter]);

  const contactById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts],
  );

  const uniqueEventCount = useMemo(() => {
    const emailSet = new Set<string>();
    for (const id of drafts.event.selectedContactIds) {
      const contact = contactById.get(id);
      if (contact) emailSet.add(contact.email.toLowerCase());
    }
    for (const email of drafts.event.manualEmails) {
      emailSet.add(email.toLowerCase());
    }
    return emailSet.size;
  }, [contactById, drafts.event.selectedContactIds, drafts.event.manualEmails]);

  const effectiveRecipientCount = mode === "date" ? 1 : uniqueEventCount;
  const exceedsRecipientLimit = mode === "event" && uniqueEventCount > MAX_RECIPIENTS;
  const activeCategoryPresets =
    mode === "date" ? DATE_CATEGORY_PRESETS : EVENT_CATEGORY_PRESETS;

  const recipientSummary =
    mode === "date"
      ? `${partnerName} (${partnerEmail})`
      : uniqueEventCount > 0
        ? `${uniqueEventCount} penerima terpilih`
        : "Belum ada penerima";

  const activeSessionRange = useMemo(() => {
    if (
      !activeSession ||
      !isValidYmdDate(activeSession.date) ||
      !isValidHmTime(activeSession.startTime) ||
      !isValidHmTime(activeSession.endTime) ||
      activeSession.startTime === activeSession.endTime
    ) {
      return null;
    }
    try {
      return resolveWibSessionUtcRange(
        activeSession.date,
        activeSession.startTime,
        activeSession.endTime,
      );
    } catch {
      return null;
    }
  }, [activeSession]);

  function handleModeChange(nextMode: NormalizedItineraryMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setContactPickerOpen(false);
  }

  function handleResetDraft(targetMode: NormalizedItineraryMode = mode) {
    updateDraft(targetMode, () =>
      createInitialDraft(targetMode, todayWib, defaultSenderName, partnerName),
    );
    if (targetMode === "event") {
      setEventSenderError(null);
    }
    setModeFeedback(targetMode, null);
  }

  function patchActiveDraftAutoIntro(
    targetMode: NormalizedItineraryMode,
    patch: Partial<ModeDraft>,
  ) {
    updateDraft(targetMode, (prev) => {
      const merged: ModeDraft = { ...prev, ...patch };
      if (!merged.introEditedManually && merged.messageTone !== "custom") {
        merged.introMessage = generateItineraryIntroMessage({
          mode: targetMode,
          tone: merged.messageTone,
          senderName:
            targetMode === "date"
              ? merged.senderName.trim() || defaultSenderName
              : merged.senderName.trim(),
          recipientName: targetMode === "date" ? partnerName : undefined,
          categoryLabel: merged.categoryLabel,
          sessionCount: merged.sessions.length,
        });
      }
      return merged;
    });
  }

  function handleSelectTone(tone: ItineraryMessageTone) {
    if (tone === "custom") {
      updateDraft(mode, (prev) => ({
        ...prev,
        messageTone: "custom",
        introEditedManually: true,
      }));
      return;
    }
    updateDraft(mode, (prev) => ({
      ...prev,
      messageTone: tone,
      introEditedManually: false,
      introMessage: generateItineraryIntroMessage({
        mode,
        tone,
        senderName: prev.senderName.trim() || defaultSenderName,
        recipientName: mode === "date" ? partnerName : undefined,
        categoryLabel: prev.categoryLabel,
        sessionCount: prev.sessions.length,
      }),
    }));
  }

  function handleResetIntroToPreset() {
    updateDraft(mode, (prev) => {
      const targetTone: ItineraryMessageTone =
        prev.messageTone === "custom" ? "natural" : prev.messageTone;
      return {
        ...prev,
        messageTone: targetTone,
        introEditedManually: false,
        introMessage: generateItineraryIntroMessage({
          mode,
          tone: targetTone,
          senderName: prev.senderName.trim() || defaultSenderName,
          recipientName: mode === "date" ? partnerName : undefined,
          categoryLabel: prev.categoryLabel,
          sessionCount: prev.sessions.length,
        }),
      };
    });
  }

  function toggleContact(id: string) {
    updateDraft("event", (prev) => ({
      ...prev,
      selectedContactIds: prev.selectedContactIds.includes(id)
        ? prev.selectedContactIds.filter((item) => item !== id)
        : [...prev.selectedContactIds, id],
    }));
  }

  function selectAllVisibleGroup() {
    const visibleIds = visibleContacts.map((c) => c.id);
    updateDraft("event", (prev) => ({
      ...prev,
      selectedContactIds: Array.from(new Set([...prev.selectedContactIds, ...visibleIds])),
    }));
  }

  function clearVisibleGroupSelection() {
    const visibleSet = new Set(visibleContacts.map((c) => c.id));
    updateDraft("event", (prev) => ({
      ...prev,
      selectedContactIds: prev.selectedContactIds.filter((id) => !visibleSet.has(id)),
    }));
  }

  function addManualEmailChip(rawValue: string) {
    const candidates = rawValue
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (candidates.length === 0) return;

    const invalid = candidates.find((email) => !EMAIL_REGEX.test(email));
    if (invalid) {
      updateDraft("event", (prev) => ({
        ...prev,
        manualEmailError: `Format email tidak valid: ${invalid}`,
      }));
      return;
    }

    updateDraft("event", (prev) => ({
      ...prev,
      manualEmails: Array.from(new Set([...prev.manualEmails, ...candidates])),
      manualEmailInput: "",
      manualEmailError: null,
    }));
  }

  function removeManualEmail(email: string) {
    updateDraft("event", (prev) => ({
      ...prev,
      manualEmails: prev.manualEmails.filter((item) => item !== email),
    }));
  }

  function updateSession(draftId: string, patch: Partial<ItinerarySessionInput>) {
    updateDraft(mode, (prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.draftId === draftId ? { ...session, ...patch } : session,
      ),
    }));
  }

  function addNextSession() {
    if (activeDraft.sessions.length >= 15) return;
    updateDraft(mode, (prev) => {
      const previous = prev.sessions[prev.sessions.length - 1];
      const suggested =
        previous &&
        isValidYmdDate(previous.date) &&
        isValidHmTime(previous.startTime) &&
        isValidHmTime(previous.endTime)
          ? suggestNextSessionSlot(previous.date, previous.startTime, previous.endTime)
          : { date: todayWib, startTime: "20:30", endTime: "21:30" };

      const nextSessions = [
        ...prev.sessions,
        {
          draftId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${prev.sessions.length + 1}`,
          title: "",
          date: suggested.date,
          startTime: suggested.startTime,
          endTime: suggested.endTime,
          locationName: "",
          mapsUrl: "",
          description: "",
        },
      ];

      const nextIntro =
        !prev.introEditedManually && prev.messageTone !== "custom"
          ? generateItineraryIntroMessage({
              mode,
              tone: prev.messageTone,
              senderName: prev.senderName.trim() || defaultSenderName,
              recipientName: mode === "date" ? partnerName : undefined,
              categoryLabel: prev.categoryLabel,
              sessionCount: nextSessions.length,
            })
          : prev.introMessage;

      return {
        ...prev,
        sessions: nextSessions,
        activeSessionIndex: nextSessions.length - 1,
        introMessage: nextIntro,
      };
    });
  }

  function moveActiveSession(direction: -1 | 1) {
    const targetIndex = safeSessionIndex + direction;
    if (targetIndex < 0 || targetIndex >= activeDraft.sessions.length) return;
    updateDraft(mode, (prev) => {
      const next = [...prev.sessions];
      const currentItem = next[safeSessionIndex];
      const targetItem = next[targetIndex];
      if (!currentItem || !targetItem) return prev;
      next[safeSessionIndex] = targetItem;
      next[targetIndex] = currentItem;
      return {
        ...prev,
        sessions: next,
        activeSessionIndex: targetIndex,
      };
    });
  }

  function removeActiveSession() {
    if (activeDraft.sessions.length <= 1) return;
    updateDraft(mode, (prev) => {
      const nextSessions = prev.sessions.filter((_, idx) => idx !== safeSessionIndex);
      const nextIndex = Math.min(safeSessionIndex, nextSessions.length - 1);
      const nextIntro =
        !prev.introEditedManually && prev.messageTone !== "custom"
          ? generateItineraryIntroMessage({
              mode,
              tone: prev.messageTone,
              senderName: prev.senderName.trim() || defaultSenderName,
              recipientName: mode === "date" ? partnerName : undefined,
              categoryLabel: prev.categoryLabel,
              sessionCount: nextSessions.length,
            })
          : prev.introMessage;
      return {
        ...prev,
        sessions: nextSessions,
        activeSessionIndex: Math.max(nextIndex, 0),
        introMessage: nextIntro,
      };
    });
  }

  async function submitItinerary() {
    const submittedMode = mode;
    const draft = drafts[submittedMode];
    setModeFeedback(submittedMode, null);

    let finalManualEmails = [...draft.manualEmails];
    if (submittedMode === "event" && draft.manualEmailInput.trim()) {
      const pendingEmail = draft.manualEmailInput.trim().toLowerCase();
      if (!EMAIL_REGEX.test(pendingEmail)) {
        updateDraft("event", (prev) => ({
          ...prev,
          manualEmailError: `Format email tidak valid: ${pendingEmail}`,
        }));
        setModeFeedback(submittedMode, {
          type: "error",
          text: `Format email manual tidak valid: ${pendingEmail}`,
        });
        return;
      }
      finalManualEmails = Array.from(new Set([...finalManualEmails, pendingEmail]));
    }

    if (submittedMode === "event" && !draft.senderName.trim()) {
      const msg = "Isi nama pengirim terlebih dahulu sebelum mengirim undangan acara.";
      setEventSenderError(msg);
      setModeFeedback(submittedMode, { type: "error", text: msg });
      eventSenderInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      eventSenderInputRef.current?.focus();
      return;
    }

    const cleanSubject = draft.subject.trim() || draft.sessions[0]?.title.trim() || "";
    if (!cleanSubject) {
      setModeFeedback(submittedMode, {
        type: "error",
        text: "Isi judul undangan atau nama kegiatan Sesi 1 dulu ya.",
      });
      return;
    }

    if (
      submittedMode === "event" &&
      draft.selectedContactIds.length === 0 &&
      finalManualEmails.length === 0
    ) {
      setModeFeedback(submittedMode, {
        type: "error",
        text: "Pilih minimal satu kontak atau ketik alamat email penerima.",
      });
      return;
    }

    if (submittedMode === "event" && uniqueEventCount > MAX_RECIPIENTS) {
      setModeFeedback(submittedMode, {
        type: "error",
        text: `Maksimal ${MAX_RECIPIENTS} penerima unik dalam satu kiriman.`,
      });
      return;
    }

    for (let i = 0; i < draft.sessions.length; i += 1) {
      const s = draft.sessions[i];
      if (!s) continue;
      if (!s.title.trim()) {
        updateDraft(submittedMode, (prev) => ({ ...prev, activeSessionIndex: i }));
        setModeFeedback(submittedMode, {
          type: "error",
          text: `Nama kegiatan pada Sesi ${i + 1} belum diisi.`,
        });
        return;
      }
      if (s.startTime === s.endTime) {
        updateDraft(submittedMode, (prev) => ({ ...prev, activeSessionIndex: i }));
        setModeFeedback(submittedMode, {
          type: "error",
          text: `Jam selesai pada Sesi ${i + 1} tidak boleh sama dengan jam mulai.`,
        });
        return;
      }
    }

    setSubmitting(true);

    const resolvedSenderName =
      submittedMode === "date"
        ? draft.senderName.trim() || defaultSenderName
        : draft.senderName.trim();
    const resolvedCategoryLabel =
      draft.categoryLabel.trim() || DEFAULT_CATEGORY_BY_MODE[submittedMode];

    try {
      const response = await fetch("/api/itinerary/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: submittedMode,
          senderName: resolvedSenderName,
          categoryLabel: resolvedCategoryLabel,
          messageTone: draft.messageTone,
          customIntroMessage: draft.introMessage.trim() || undefined,
          contactIds: submittedMode === "event" ? draft.selectedContactIds : [],
          manualEmails: submittedMode === "event" ? finalManualEmails : [],
          subject: cleanSubject,
          alarmMinutes: draft.alarmMinutes,
          icsMode: draft.sessions.length > 1 ? draft.icsMode : "combined",
          sessions: draft.sessions.map((s) => ({
            title: s.title.trim(),
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            locationName: s.locationName?.trim() || undefined,
            mapsUrl: s.mapsUrl?.trim() || undefined,
            description: s.description?.trim() || undefined,
          })),
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: {
          accepted?: string[];
          attachmentFilenames?: string[];
        };
      };

      if (!response.ok || !body.ok) {
        setModeFeedback(submittedMode, {
          type: "error",
          text: body.message ?? "Gagal mengirim undangan itinerary.",
        });
        return;
      }

      const acceptedList = body.data?.accepted?.join(", ");
      const files = body.data?.attachmentFilenames?.join(", ");

      // Auto-reset bersih untuk draft mode yang baru saja terkirim.
      updateDraft(submittedMode, () =>
        createInitialDraft(submittedMode, todayWib, defaultSenderName, partnerName),
      );

      setModeFeedback(submittedMode, {
        type: "success",
        text: `${body.message ?? "Undangan terkirim!"}${acceptedList ? ` Diterima SMTP: ${acceptedList}.` : ""}${files ? ` Lampiran: ${files}.` : ""}`,
      });
      await onSentSuccess();
    } catch {
      setModeFeedback(submittedMode, {
        type: "error",
        text: "Koneksi gagal saat mengirim undangan. Coba lagi sebentar lagi ya.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitItinerary();
  }

  const feedbackBanner = feedback ? (
    <div
      role={feedback.type === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
        feedback.type === "error"
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
          : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
      }`}
    >
      {feedback.type === "error" ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
      )}
      <span>{feedback.text}</span>
    </div>
  ) : null;

  const actionControls = (
    <div className="space-y-2.5">
      {feedbackBanner}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submitItinerary()}
          disabled={submitting || exceedsRecipientLimit}
          className="btn-primary-accent inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors active:scale-[0.99] disabled:opacity-60"
        >
          <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span>
            {submitting
              ? "Mengirim..."
              : `Kirim Undangan (${effectiveRecipientCount})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleResetDraft(mode)}
          disabled={submitting}
          title="Reset draft mode ini"
          className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Undangan &amp; Itinerary
          </h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Susun jadwal ringkas per sesi dan kirim undangan kalender siap klik.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMobilePreviewOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] lg:hidden"
        >
          <Ticket className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
          <span>Lihat Pratinjau ({activeDraft.sessions.length})</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <form onSubmit={handleFormSubmit} className="space-y-4 lg:col-span-7" noValidate>
          {/* 1. Bar Mode & Penerima yang Padat */}
          <section
            aria-labelledby="recipient-mode-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-xs sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="recipient-mode-heading"
                className="font-display text-base font-semibold text-[var(--ink)]"
              >
                Mode &amp; Penerima
              </h2>
              <span className="font-mono-num text-xs font-semibold text-[var(--ink-muted)]">
                {mode === "date" ? "Pasangan aktif" : `${uniqueEventCount} / ${MAX_RECIPIENTS} penerima`}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Mode penerima undangan"
              className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "date"}
                onClick={() => handleModeChange("date")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold whitespace-nowrap transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
                  mode === "date"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Heart
                  className={`h-4 w-4 shrink-0 ${mode === "date" ? "text-[var(--accent)]" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>Date Itinerary</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={mode === "event"}
                onClick={() => handleModeChange("event")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold whitespace-nowrap transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
                  mode === "event"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <CalendarDays
                  className={`h-4 w-4 shrink-0 ${mode === "event" ? "text-[var(--accent)]" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>Acara &amp; Kegiatan</span>
              </button>
            </div>

            {mode === "date" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Lock className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
                  <p className="truncate text-xs font-semibold text-[var(--ink)] sm:text-sm">
                    {partnerName}{" "}
                    <span className="font-normal text-[var(--ink-muted)]">({partnerEmail})</span>
                  </p>
                </div>
                <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                  Sinkron Kontrol Absen
                </span>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="event-sender-name-primary"
                    className="block text-xs font-semibold text-[var(--ink)]"
                  >
                    Nama Pengirim <span className="text-[var(--danger-fg)]">*</span>
                  </label>
                  <input
                    ref={eventSenderInputRef}
                    id="event-sender-name-primary"
                    type="text"
                    required
                    maxLength={60}
                    aria-invalid={Boolean(eventSenderError)}
                    value={drafts.event.senderName}
                    onChange={(event) => {
                      if (eventSenderError) setEventSenderError(null);
                      patchActiveDraftAutoIntro("event", {
                        senderName: event.target.value,
                        senderDirty: true,
                      });
                    }}
                    placeholder="Tulis namamu / nama penyelenggara, mis. Syamsu"
                    className={`mt-1 min-h-[44px] w-full rounded-xl border bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm ${
                      eventSenderError
                        ? "border-[var(--danger-border)] ring-1 ring-[var(--danger-border)]"
                        : "border-[var(--border-control)]"
                    }`}
                  />
                  {eventSenderError ? (
                    <p role="alert" className="mt-1 text-xs font-medium text-[var(--danger-fg)]">
                      {eventSenderError}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                      Nama ini tampil sebagai pengirim undangan di Gmail &amp; Google Calendar penerima.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setContactPickerOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                  >
                    <Users className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.9} aria-hidden="true" />
                    <span>Pilih dari Kontak ({drafts.event.selectedContactIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setContactsModalOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                    <span>Kelola</span>
                  </button>

                  <div className="flex min-w-[210px] flex-1 gap-1.5">
                    <input
                      id="manual-email-input"
                      type="email"
                      value={drafts.event.manualEmailInput}
                      onChange={(event) =>
                        updateDraft("event", (prev) => ({
                          ...prev,
                          manualEmailInput: event.target.value,
                          manualEmailError: null,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addManualEmailChip(drafts.event.manualEmailInput);
                        }
                      }}
                      placeholder="Ketik email + Enter"
                      className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => addManualEmailChip(drafts.event.manualEmailInput)}
                      className="min-h-[44px] shrink-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {drafts.event.manualEmailError ? (
                  <p role="alert" className="text-xs font-medium text-[var(--danger-fg)]">
                    {drafts.event.manualEmailError}
                  </p>
                ) : null}

                {drafts.event.selectedContactIds.length > 0 ||
                drafts.event.manualEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {drafts.event.selectedContactIds.map((id) => {
                      const c = contactById.get(id);
                      if (!c) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-tint)] py-1 pr-1 pl-2.5 text-xs font-semibold text-[var(--ink)]"
                        >
                          <span className="max-w-[180px] truncate sm:max-w-none">{c.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleContact(id)}
                            aria-label={`Hapus ${c.name}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-[var(--surface)] sm:h-6 sm:w-6"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}
                    {drafts.event.manualEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface-elevated)] py-1 pr-1 pl-2.5 text-xs font-medium text-[var(--ink)]"
                      >
                        <span className="max-w-[180px] truncate sm:max-w-none">{email}</span>
                        <button
                          type="button"
                          onClick={() => removeManualEmail(email)}
                          aria-label={`Hapus ${email}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-[var(--surface)] sm:h-6 sm:w-6"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* 2. Master-Detail Session Builder (Anti-Memanjang) */}
          <section
            aria-labelledby="sessions-builder-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-xs sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="sessions-builder-heading"
                className="font-display text-base font-semibold text-[var(--ink)]"
              >
                Rangkaian Sesi ({activeDraft.sessions.length})
              </h2>
              <span className="font-mono-num text-xs text-[var(--ink-muted)]">
                Zona Waktu WIB
              </span>
            </div>

            {/* Session Strip Horizontal Scrollable */}
            <div className="custom-scrollbar mt-3 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto pb-1">
              {activeDraft.sessions.map((session, idx) => {
                const isSelected = idx === safeSessionIndex;
                return (
                  <button
                    key={session.draftId}
                    type="button"
                    onClick={() =>
                      updateDraft(mode, (prev) => ({
                        ...prev,
                        activeSessionIndex: idx,
                      }))
                    }
                    className={`inline-flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span
                      className={`font-mono-num inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                        isSelected
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "bg-[var(--surface)] text-[var(--ink)]"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="max-w-[120px] truncate">
                      {session.title.trim() || `Sesi ${idx + 1}`}
                    </span>
                    <span className="font-mono-num text-[11px] opacity-80">
                      {session.startTime}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={addNextSession}
                disabled={activeDraft.sessions.length >= 15}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-[var(--accent)] bg-[var(--accent-tint)] px-3.5 text-xs font-bold text-[var(--accent)] hover:opacity-90 disabled:opacity-45"
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                <span>Sesi</span>
              </button>
            </div>

            {/* Single Active Session Editor */}
            {activeSession ? (
              <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[var(--ink)]">
                      Edit Sesi {safeSessionIndex + 1} dari {activeDraft.sessions.length}
                    </span>
                    {activeSessionRange ? (
                      <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 font-mono-num text-[11px] font-semibold text-[var(--ink-muted)]">
                        {formatDurationIndonesian(activeSessionRange.durationMinutes)}
                      </span>
                    ) : null}
                    {activeSessionRange?.crossesMidnight ? (
                      <span className="rounded-md bg-[var(--warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-fg)]">
                        +1 hari
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveActiveSession(-1)}
                      disabled={safeSessionIndex === 0}
                      aria-label="Geser sesi ke kiri"
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                    >
                      <ArrowLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveActiveSession(1)}
                      disabled={safeSessionIndex === activeDraft.sessions.length - 1}
                      aria-label="Geser sesi ke kanan"
                      className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                    >
                      <ArrowRight className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                    </button>
                    {activeDraft.sessions.length > 1 ? (
                      <button
                        type="button"
                        onClick={removeActiveSession}
                        aria-label={`Hapus Sesi ${safeSessionIndex + 1}`}
                        className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:opacity-85"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={`session-title-${activeSession.draftId}`}
                      className="block text-xs font-semibold text-[var(--ink)]"
                    >
                      Nama Kegiatan *
                    </label>
                    <input
                      id={`session-title-${activeSession.draftId}`}
                      type="text"
                      required
                      maxLength={140}
                      value={activeSession.title}
                      onChange={(event) =>
                        updateSession(activeSession.draftId, { title: event.target.value })
                      }
                      placeholder="Contoh: Ngopi sore / Makan malam / Meeting tim"
                      className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
                    <div className="min-[420px]:col-span-2 sm:col-span-1">
                      <label
                        htmlFor={`session-date-${activeSession.draftId}`}
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Tanggal (WIB)
                      </label>
                      <input
                        id={`session-date-${activeSession.draftId}`}
                        type="date"
                        required
                        value={activeSession.date}
                        onChange={(event) =>
                          updateSession(activeSession.draftId, { date: event.target.value })
                        }
                        className="font-mono-num mt-1 min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] sm:text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`session-start-${activeSession.draftId}`}
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Mulai (24 Jam)
                      </label>
                      <TimePicker24h
                        id={`session-start-${activeSession.draftId}`}
                        value={activeSession.startTime}
                        onChange={(nextHm) =>
                          updateSession(activeSession.draftId, { startTime: nextHm })
                        }
                        ariaLabel="Jam mulai sesi"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`session-end-${activeSession.draftId}`}
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Selesai (24 Jam)
                      </label>
                      <TimePicker24h
                        id={`session-end-${activeSession.draftId}`}
                        value={activeSession.endTime}
                        onChange={(nextHm) =>
                          updateSession(activeSession.draftId, { endTime: nextHm })
                        }
                        ariaLabel="Jam selesai sesi"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`session-location-${activeSession.draftId}`}
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Lokasi (opsional)
                      </label>
                      <input
                        id={`session-location-${activeSession.draftId}`}
                        type="text"
                        maxLength={180}
                        value={activeSession.locationName ?? ""}
                        onChange={(event) =>
                          updateSession(activeSession.draftId, {
                            locationName: event.target.value,
                          })
                        }
                        placeholder="Nama kafe / kantor / titik temu"
                        className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`session-maps-${activeSession.draftId}`}
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Link Google Maps (opsional)
                      </label>
                      <input
                        id={`session-maps-${activeSession.draftId}`}
                        type="url"
                        value={activeSession.mapsUrl ?? ""}
                        onChange={(event) =>
                          updateSession(activeSession.draftId, { mapsUrl: event.target.value })
                        }
                        placeholder="https://maps.google.com/..."
                        className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`session-notes-${activeSession.draftId}`}
                      className="block text-xs font-semibold text-[var(--ink)]"
                    >
                      Catatan Sesi (opsional)
                    </label>
                    <textarea
                      id={`session-notes-${activeSession.draftId}`}
                      rows={2}
                      maxLength={800}
                      value={activeSession.description ?? ""}
                      onChange={(event) =>
                        updateSession(activeSession.draftId, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Dress code, titik kumpul, atau catatan singkat lainnya..."
                      className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* 3. Judul Undangan + Progressive Disclosure Personalisasi & Kalender */}
          <section
            aria-labelledby="email-personalization-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-xs sm:p-5"
          >
            <div>
              <label
                htmlFor="itinerary-subject"
                className="block text-xs font-semibold text-[var(--ink)]"
              >
                Judul Undangan / Subjek Email
              </label>
              <input
                id="itinerary-subject"
                type="text"
                maxLength={140}
                value={activeDraft.subject}
                onChange={(event) =>
                  updateDraft(mode, (prev) => ({ ...prev, subject: event.target.value }))
                }
                placeholder={
                  mode === "date"
                    ? "Contoh: Weekend Date di Jakarta Selatan"
                    : "Contoh: Kumpul Akhir Pekan"
                }
                className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5">
              <p className="text-xs text-[var(--ink-muted)]">
                <strong
                  className={`font-semibold ${
                    mode === "event" && !activeDraft.senderName.trim()
                      ? "text-[var(--warning-fg)]"
                      : "text-[var(--ink)]"
                  }`}
                >
                  {mode === "date"
                    ? activeDraft.senderName.trim() || defaultSenderName
                    : activeDraft.senderName.trim() || "Nama pengirim belum diisi"}
                </strong>
                {" · "}
                {activeDraft.categoryLabel.trim() || DEFAULT_CATEGORY_BY_MODE[mode]}
                {" · "}
                Gaya {TONE_LABELS[activeDraft.messageTone]}
                {" · "}
                Pengingat {activeDraft.alarmMinutes}m
              </p>

              <button
                type="button"
                id="email-personalization-heading"
                aria-expanded={personalizationOpen}
                onClick={() => setPersonalizationOpen((prev) => !prev)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
                <span>{personalizationOpen ? "Tutup Opsi" : "Ubah Tampilan & Kalender"}</span>
                {personalizationOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </div>

            {personalizationOpen ? (
              <div className="mt-3 space-y-4 border-t border-[var(--border-subtle)] pt-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="itinerary-sender-name"
                        className="block text-xs font-semibold text-[var(--ink)]"
                      >
                        Nama Pengirim Email{mode === "event" ? " *" : ""}
                      </label>
                      {mode === "date" && activeDraft.senderName.trim() !== defaultSenderName ? (
                        <button
                          type="button"
                          onClick={() =>
                            patchActiveDraftAutoIntro("date", {
                              senderName: defaultSenderName,
                              senderDirty: false,
                            })
                          }
                          className="text-xs font-semibold text-[var(--accent)] hover:underline"
                        >
                          Default ({defaultSenderName})
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="itinerary-sender-name"
                      type="text"
                      maxLength={60}
                      value={activeDraft.senderName}
                      onChange={(event) => {
                        if (mode === "event" && eventSenderError) {
                          setEventSenderError(null);
                        }
                        patchActiveDraftAutoIntro(mode, {
                          senderName: event.target.value,
                          senderDirty: true,
                        });
                      }}
                      placeholder={
                        mode === "date"
                          ? defaultSenderName
                          : "Tulis namamu / nama penyelenggara"
                      }
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-base text-[var(--ink)] sm:text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="itinerary-alarm-select"
                      className="block text-xs font-semibold text-[var(--ink)]"
                    >
                      Pengingat Kalender
                    </label>
                    <select
                      id="itinerary-alarm-select"
                      value={activeDraft.alarmMinutes}
                      onChange={(event) =>
                        updateDraft(mode, (prev) => ({
                          ...prev,
                          alarmMinutes: Number(event.target.value) as AlarmMinutes,
                        }))
                      }
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-base text-[var(--ink)] sm:text-sm"
                    >
                      <option value={15}>15 menit sebelum</option>
                      <option value={30}>30 menit sebelum</option>
                      <option value={60}>1 jam sebelum</option>
                    </select>
                  </div>
                </div>

                {activeDraft.sessions.length > 1 ? (
                  <div>
                    <label
                      htmlFor="ics-mode-select"
                      className="block text-xs font-semibold text-[var(--ink)]"
                    >
                      Mode Lampiran Kalender ({activeDraft.sessions.length} sesi)
                    </label>
                    <select
                      id="ics-mode-select"
                      value={activeDraft.icsMode}
                      onChange={(event) =>
                        updateDraft(mode, (prev) => ({
                          ...prev,
                          icsMode: event.target.value as IcsBundleMode,
                        }))
                      }
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-base text-[var(--ink)] sm:text-sm"
                    >
                      <option value="combined">Semua sesi dalam 1 file .ics</option>
                      <option value="separate">Terpisah 1 file .ics per sesi</option>
                    </select>
                  </div>
                ) : null}

                <div>
                  <span className="block text-xs font-semibold text-[var(--ink)]">
                    Kategori Kegiatan (Badge Email)
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {activeCategoryPresets.map((preset) => {
                      const active =
                        !activeDraft.categoryIsCustom && activeDraft.categoryLabel === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            patchActiveDraftAutoIntro(mode, {
                              categoryLabel: preset,
                              categoryIsCustom: false,
                            })
                          }
                          className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                              : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft(mode, (prev) => ({ ...prev, categoryIsCustom: true }))
                      }
                      className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        activeDraft.categoryIsCustom
                          ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      Tulis Sendiri
                    </button>
                  </div>

                  {activeDraft.categoryIsCustom ? (
                    <input
                      id="itinerary-custom-category"
                      type="text"
                      maxLength={40}
                      value={activeDraft.categoryLabel}
                      onChange={(event) =>
                        patchActiveDraftAutoIntro(mode, { categoryLabel: event.target.value })
                      }
                      placeholder="Contoh: Syukuran Rumah, Rapat Tim, Roadtrip..."
                      className="mt-2 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-base text-[var(--ink)] sm:text-sm"
                    />
                  ) : null}
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="block text-xs font-semibold text-[var(--ink)]">
                      Gaya Bahasa &amp; Pesan Pembuka
                    </span>
                    {activeDraft.introEditedManually ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[var(--surface-elevated)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                          Diedit manual
                        </span>
                        <button
                          type="button"
                          onClick={handleResetIntroToPreset}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                          <span>Reset ke preset</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(["formal", "natural", "casual", "custom"] as const).map((toneVal) => {
                      const active = activeDraft.messageTone === toneVal;
                      return (
                        <button
                          key={toneVal}
                          type="button"
                          onClick={() => handleSelectTone(toneVal)}
                          className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                              : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {TONE_LABELS[toneVal]}
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    id="itinerary-intro-message"
                    rows={3}
                    maxLength={600}
                    value={activeDraft.introMessage}
                    onChange={(event) =>
                      updateDraft(mode, (prev) => ({
                        ...prev,
                        introMessage: event.target.value,
                        introEditedManually: true,
                      }))
                    }
                    placeholder="Tulis pesan pembuka undangan di sini..."
                    className="mt-2 w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 py-2 text-base leading-relaxed text-[var(--ink)] sm:text-sm"
                  />
                  <p className="mt-0.5 text-right font-mono-num text-[11px] text-[var(--ink-muted)]">
                    {activeDraft.introMessage.length} / 600
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          {/* Bar Aksi Mobile (< lg) */}
          <div className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-xs lg:hidden">
            {actionControls}
            <button
              type="button"
              onClick={() => setMobilePreviewOpen(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            >
              <Ticket className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
              <span>Lihat Pratinjau Tiket ({activeDraft.sessions.length} sesi)</span>
            </button>
          </div>
        </form>

        {/* Kolom Kanan Desktop: Sticky Live Preview + Pinned Footer CTA */}
        <div className="hidden lg:col-span-5 lg:block">
          <ItineraryPreview
            mode={mode}
            senderName={activeDraft.senderName}
            categoryLabel={activeDraft.categoryLabel}
            introMessage={activeDraft.introMessage}
            recipientCount={effectiveRecipientCount}
            recipientSummary={recipientSummary}
            partnerName={partnerName}
            subject={activeDraft.subject || activeDraft.sessions[0]?.title || ""}
            alarmMinutes={activeDraft.alarmMinutes}
            icsMode={activeDraft.icsMode}
            sessions={activeDraft.sessions}
            activeSessionIndex={safeSessionIndex}
            onSelectSession={(idx) =>
              updateDraft(mode, (prev) => ({ ...prev, activeSessionIndex: idx }))
            }
            footerActions={actionControls}
          />
        </div>
      </div>

      {/* Modal Pemilih Kontak Tersimpan (mode Acara & Kegiatan) */}
      {contactPickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setContactPickerOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pilih penerima dari daftar kontak"
            className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-xl sm:rounded-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--ink)]">
                  Pilih Kontak Penerima
                </h3>
                <p className="text-xs text-[var(--ink-muted)]">
                  {uniqueEventCount} / {MAX_RECIPIENTS} penerima dipilih
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContactPickerOpen(false)}
                aria-label="Tutup pemilih kontak"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-5">
              {contacts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-xs text-[var(--ink-muted)]">
                  Belum ada kontak tersimpan. Klik <strong>Kelola Kontak</strong> untuk menambah daftar kontak.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter grup kontak">
                      <button
                        type="button"
                        onClick={() => setActiveGroupFilter("ALL")}
                        className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold ${
                          activeGroupFilter === "ALL"
                            ? "bg-[var(--ink)] text-[var(--bg)]"
                            : "bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        Semua ({contacts.length})
                      </button>
                      {contactGroups.map((grp) => (
                        <button
                          key={grp}
                          type="button"
                          onClick={() => setActiveGroupFilter(grp)}
                          className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold ${
                            activeGroupFilter === grp
                              ? "bg-[var(--ink)] text-[var(--bg)]"
                              : "bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {grp}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllVisibleGroup}
                        className="font-semibold text-[var(--accent)] hover:underline"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-[var(--ink-muted)]" aria-hidden="true">
                        /
                      </span>
                      <button
                        type="button"
                        onClick={clearVisibleGroupSelection}
                        className="font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibleContacts.map((contact) => {
                      const checked = drafts.event.selectedContactIds.includes(contact.id);
                      return (
                        <label
                          key={contact.id}
                          className={`flex min-h-[46px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                            checked
                              ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                              : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-muted)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleContact(contact.id)}
                            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-[var(--ink)]">
                              {contact.name}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--ink-muted)]">
                              {contact.email} · {contact.group}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setContactPickerOpen(false);
                  setContactsModalOpen(true);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
              >
                <UserPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                <span>Kelola Kontak</span>
              </button>

              <button
                type="button"
                onClick={() => setContactPickerOpen(false)}
                className="btn-primary-accent min-h-[44px] rounded-xl px-5 text-xs font-bold"
              >
                Selesai ({drafts.event.selectedContactIds.length})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom Sheet Pratinjau Mobile */}
      {mobilePreviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 lg:hidden"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMobilePreviewOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pratinjau tiket undangan"
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--bg)] p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-base font-bold text-[var(--ink)]">
                Pratinjau Tiket
              </span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                aria-label="Tutup pratinjau tiket"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <ItineraryPreview
              mode={mode}
              senderName={activeDraft.senderName}
              categoryLabel={activeDraft.categoryLabel}
              introMessage={activeDraft.introMessage}
              recipientCount={effectiveRecipientCount}
              recipientSummary={recipientSummary}
              partnerName={partnerName}
              subject={activeDraft.subject || activeDraft.sessions[0]?.title || ""}
              alarmMinutes={activeDraft.alarmMinutes}
              icsMode={activeDraft.icsMode}
              sessions={activeDraft.sessions}
              activeSessionIndex={safeSessionIndex}
              onSelectSession={(idx) => {
                updateDraft(mode, (prev) => ({ ...prev, activeSessionIndex: idx }));
                setMobilePreviewOpen(false);
              }}
              sticky={false}
              footerActions={actionControls}
            />
          </div>
        </div>
      ) : null}

      <ContactsModal
        open={contactsModalOpen}
        contacts={contacts}
        groups={contactGroups}
        onClose={() => setContactsModalOpen(false)}
        onChanged={onContactsChanged}
      />
    </div>
  );
}
