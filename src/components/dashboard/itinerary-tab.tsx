"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Heart,
  Lock,
  Plus,
  RotateCcw,
  Send,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { ContactsModal } from "@/components/dashboard/contacts-modal";
import { ItineraryPreview } from "@/components/dashboard/itinerary-preview";
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
  ItineraryRecipientMode,
  ItinerarySessionInput,
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

function createInitialSession(dateWib: string): SessionDraft {
  return {
    draftId: `session-${Date.now()}-1`,
    title: "",
    date: dateWib,
    startTime: "19:00",
    endTime: "20:30",
    locationName: "",
    mapsUrl: "",
    description: "",
  };
}

function computeGapLabel(
  prev: SessionDraft,
  next: SessionDraft,
): string | null {
  if (
    !isValidYmdDate(prev.date) ||
    !isValidHmTime(prev.startTime) ||
    !isValidHmTime(prev.endTime) ||
    prev.startTime === prev.endTime ||
    !isValidYmdDate(next.date) ||
    !isValidHmTime(next.startTime) ||
    !isValidHmTime(next.endTime) ||
    next.startTime === next.endTime
  ) {
    return null;
  }

  try {
    const prevRange = resolveWibSessionUtcRange(prev.date, prev.startTime, prev.endTime);
    const nextRange = resolveWibSessionUtcRange(next.date, next.startTime, next.endTime);
    const gapMins = Math.round(
      (nextRange.startUtc.getTime() - prevRange.endUtc.getTime()) / 60_000,
    );
    if (gapMins === 0) return "Langsung lanjut";
    if (gapMins > 0 && gapMins <= 24 * 60) {
      return `Jeda ${formatDurationIndonesian(gapMins)}`;
    }
    if (gapMins < 0) return "Jadwal tumpang tindih";
    return null;
  } catch {
    return null;
  }
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
  const [mode, setMode] = useState<ItineraryRecipientMode>("date");
  const [senderName, setSenderName] = useState(defaultSenderName);
  const [senderDirty, setSenderDirty] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState<string>(DEFAULT_CATEGORY_BY_MODE.date);
  const [categoryIsCustom, setCategoryIsCustom] = useState(false);
  const [messageTone, setMessageTone] = useState<ItineraryMessageTone>("natural");
  const [introEditedManually, setIntroEditedManually] = useState(false);

  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("ALL");
  const [manualEmailInput, setManualEmailInput] = useState("");
  const [manualEmails, setManualEmails] = useState<string[]>([]);
  const [manualEmailError, setManualEmailError] = useState<string | null>(null);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const [subject, setSubject] = useState("");
  const [alarmMinutes, setAlarmMinutes] = useState<AlarmMinutes>(30);
  const [icsMode, setIcsMode] = useState<IcsBundleMode>("combined");
  const [sessions, setSessions] = useState<SessionDraft[]>(() => [
    createInitialSession(todayWib),
  ]);
  const [expandedExtras, setExpandedExtras] = useState<Record<string, boolean>>({});
  const [introMessage, setIntroMessage] = useState<string>(() =>
    generateItineraryIntroMessage({
      mode: "date",
      tone: "natural",
      senderName: defaultSenderName,
      recipientName: partnerName,
      categoryLabel: DEFAULT_CATEGORY_BY_MODE.date,
      sessionCount: 1,
    }),
  );

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!senderDirty) {
      setSenderName(defaultSenderName);
    }
  }, [defaultSenderName, senderDirty]);

  useEffect(() => {
    if (introEditedManually || messageTone === "custom") return;
    setIntroMessage(
      generateItineraryIntroMessage({
        mode,
        tone: messageTone,
        senderName: senderName.trim() || defaultSenderName,
        recipientName: mode === "date" ? partnerName : undefined,
        categoryLabel,
        sessionCount: sessions.length,
      }),
    );
  }, [
    mode,
    messageTone,
    senderName,
    defaultSenderName,
    partnerName,
    categoryLabel,
    sessions.length,
    introEditedManually,
  ]);

  useEffect(() => {
    if (!mobilePreviewOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobilePreviewOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobilePreviewOpen]);

  const visibleContacts = useMemo(() => {
    if (activeGroupFilter === "ALL") return contacts;
    return contacts.filter((c) => c.group === activeGroupFilter);
  }, [contacts, activeGroupFilter]);

  const uniqueFriendsCount = useMemo(() => {
    const emailSet = new Set<string>();
    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    for (const id of selectedContactIds) {
      const contact = contactMap.get(id);
      if (contact) emailSet.add(contact.email.toLowerCase());
    }
    for (const email of manualEmails) {
      emailSet.add(email.toLowerCase());
    }
    return emailSet.size;
  }, [contacts, selectedContactIds, manualEmails]);

  const effectiveRecipientCount = mode === "date" ? 1 : uniqueFriendsCount;
  const exceedsRecipientLimit = mode !== "date" && uniqueFriendsCount > MAX_RECIPIENTS;
  const activeCategoryPresets =
    mode === "date" ? DATE_CATEGORY_PRESETS : EVENT_CATEGORY_PRESETS;

  function handleModeChange(nextMode: ItineraryRecipientMode) {
    setMode(nextMode);
    if (!categoryIsCustom) {
      setCategoryLabel(DEFAULT_CATEGORY_BY_MODE[nextMode === "date" ? "date" : "event"]);
    }
  }

  function handleSelectTone(tone: ItineraryMessageTone) {
    setMessageTone(tone);
    if (tone === "custom") {
      setIntroEditedManually(true);
      return;
    }
    setIntroEditedManually(false);
    setIntroMessage(
      generateItineraryIntroMessage({
        mode,
        tone,
        senderName: senderName.trim() || defaultSenderName,
        recipientName: mode === "date" ? partnerName : undefined,
        categoryLabel,
        sessionCount: sessions.length,
      }),
    );
  }

  function handleResetIntroToPreset() {
    const targetTone: ItineraryMessageTone =
      messageTone === "custom" ? "natural" : messageTone;
    setMessageTone(targetTone);
    setIntroEditedManually(false);
    setIntroMessage(
      generateItineraryIntroMessage({
        mode,
        tone: targetTone,
        senderName: senderName.trim() || defaultSenderName,
        recipientName: mode === "date" ? partnerName : undefined,
        categoryLabel,
        sessionCount: sessions.length,
      }),
    );
  }

  function toggleContact(id: string) {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function selectAllVisibleGroup() {
    const visibleIds = visibleContacts.map((c) => c.id);
    setSelectedContactIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  }

  function clearVisibleGroupSelection() {
    const visibleSet = new Set(visibleContacts.map((c) => c.id));
    setSelectedContactIds((prev) => prev.filter((id) => !visibleSet.has(id)));
  }

  function addManualEmailChip(rawValue: string) {
    const candidates = rawValue
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (candidates.length === 0) return;

    const invalid = candidates.find((email) => !EMAIL_REGEX.test(email));
    if (invalid) {
      setManualEmailError(`Format email tidak valid: ${invalid}`);
      return;
    }

    setManualEmails((prev) => Array.from(new Set([...prev, ...candidates])));
    setManualEmailInput("");
    setManualEmailError(null);
  }

  function removeManualEmail(email: string) {
    setManualEmails((prev) => prev.filter((item) => item !== email));
  }

  function updateSession(draftId: string, patch: Partial<ItinerarySessionInput>) {
    setSessions((prev) =>
      prev.map((session) =>
        session.draftId === draftId ? { ...session, ...patch } : session,
      ),
    );
  }

  function addNextSession() {
    if (sessions.length >= 15) return;
    const previous = sessions[sessions.length - 1];
    const suggested =
      previous &&
      isValidYmdDate(previous.date) &&
      isValidHmTime(previous.startTime) &&
      isValidHmTime(previous.endTime)
        ? suggestNextSessionSlot(previous.date, previous.startTime, previous.endTime)
        : { date: todayWib, startTime: "20:30", endTime: "21:30" };

    setSessions((prev) => [
      ...prev,
      {
        draftId: `session-${Date.now()}-${prev.length + 1}`,
        title: "",
        date: suggested.date,
        startTime: suggested.startTime,
        endTime: suggested.endTime,
        locationName: "",
        mapsUrl: "",
        description: "",
      },
    ]);
  }

  function moveSession(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sessions.length) return;
    setSessions((prev) => {
      const next = [...prev];
      const currentItem = next[index];
      const targetItem = next[targetIndex];
      if (!currentItem || !targetItem) return prev;
      next[index] = targetItem;
      next[targetIndex] = currentItem;
      return next;
    });
  }

  function removeSession(draftId: string) {
    if (sessions.length <= 1) return;
    setSessions((prev) => prev.filter((s) => s.draftId !== draftId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const pendingEmail = manualEmailInput.trim();
    let finalManualEmails = [...manualEmails];
    if (mode !== "date" && pendingEmail) {
      if (!EMAIL_REGEX.test(pendingEmail)) {
        setManualEmailError(`Format email tidak valid: ${pendingEmail}`);
        return;
      }
      finalManualEmails = Array.from(new Set([...finalManualEmails, pendingEmail.toLowerCase()]));
      setManualEmails(finalManualEmails);
      setManualEmailInput("");
      setManualEmailError(null);
    }

    const cleanSubject = subject.trim() || sessions[0]?.title.trim() || "";
    if (!cleanSubject) {
      setFeedback({
        type: "error",
        text: "Isi judul undangan atau judul acara Sesi 1 dulu ya.",
      });
      return;
    }

    if (mode !== "date" && effectiveRecipientCount === 0 && finalManualEmails.length === 0) {
      setFeedback({
        type: "error",
        text: "Pilih minimal satu kontak atau ketik alamat email penerima.",
      });
      return;
    }

    if (exceedsRecipientLimit) {
      setFeedback({
        type: "error",
        text: `Maksimal ${MAX_RECIPIENTS} penerima unik dalam satu kiriman.`,
      });
      return;
    }

    for (let i = 0; i < sessions.length; i += 1) {
      const s = sessions[i];
      if (!s) continue;
      if (!s.title.trim()) {
        setFeedback({ type: "error", text: `Judul acara pada Sesi ${i + 1} belum diisi.` });
        return;
      }
      if (s.startTime === s.endTime) {
        setFeedback({
          type: "error",
          text: `Jam selesai pada Sesi ${i + 1} tidak boleh sama dengan jam mulai.`,
        });
        return;
      }
    }

    setSubmitting(true);

    const resolvedSenderName = senderName.trim() || defaultSenderName;
    const resolvedCategoryLabel =
      categoryLabel.trim() || DEFAULT_CATEGORY_BY_MODE[mode === "date" ? "date" : "event"];

    try {
      const response = await fetch("/api/itinerary/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          senderName: resolvedSenderName,
          categoryLabel: resolvedCategoryLabel,
          messageTone,
          customIntroMessage: introMessage.trim() || undefined,
          contactIds: mode !== "date" ? selectedContactIds : [],
          manualEmails: mode !== "date" ? finalManualEmails : [],
          subject: cleanSubject,
          alarmMinutes,
          icsMode: sessions.length > 1 ? icsMode : "combined",
          sessions: sessions.map((s) => ({
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
          attachmentFilenames?: string[];
        };
      };

      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal mengirim undangan itinerary.",
        });
        return;
      }

      const files = body.data?.attachmentFilenames?.join(", ");
      setFeedback({
        type: "success",
        text: `${body.message ?? "Undangan terkirim!"}${files ? ` Lampiran: ${files}.` : ""}`,
      });
      await onSentSuccess();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim undangan. Coba lagi sebentar lagi ya.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Rancang Undangan &amp; Itinerary
          </h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Susun rencana date atau beragam acara &amp; kegiatan, lalu kirim langsung ke Google Calendar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMobilePreviewOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] lg:hidden"
        >
          <Ticket className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
          <span>Intip Tiket ({sessions.length} sesi)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <form onSubmit={handleSubmit} className="space-y-5 lg:col-span-7" noValidate>
          <section
            aria-labelledby="recipient-mode-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono-num inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-tint)] text-xs font-bold text-[var(--accent)]">
                1
              </span>
              <h2
                id="recipient-mode-heading"
                className="font-display text-lg font-semibold text-[var(--ink)] sm:text-xl"
              >
                Siapa yang Diundang?
              </h2>
            </div>

            <div
              role="radiogroup"
              aria-label="Mode penerima undangan"
              className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "date"}
                onClick={() => handleModeChange("date")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                  mode === "date"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${mode === "date" ? "text-[var(--accent)]" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>Date Itinerary</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={mode !== "date"}
                onClick={() => handleModeChange("event")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                  mode !== "date"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <CalendarDays
                  className={`h-4 w-4 ${mode !== "date" ? "text-[var(--accent)]" : ""}`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span>Acara &amp; Kegiatan</span>
              </button>
            </div>

            {mode === "date" ? (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">
                      {partnerName}
                    </p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">
                      {partnerEmail}
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-muted)]">
                  Sinkron dari Kontrol Absen
                </span>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`font-mono-num text-xs font-semibold ${
                      exceedsRecipientLimit ? "text-[var(--danger-fg)]" : "text-[var(--ink-muted)]"
                    }`}
                  >
                    {uniqueFriendsCount} / {MAX_RECIPIENTS} penerima dipilih
                  </p>
                  <button
                    type="button"
                    onClick={() => setContactsModalOpen(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                    <span>Kelola Kontak</span>
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-xs text-[var(--ink-muted)]">
                    Belum ada kontak teman tersimpan. Klik <strong>Kelola Kontak</strong> atau ketik email langsung di bawah.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter grup kontak">
                        <button
                          type="button"
                          onClick={() => setActiveGroupFilter("ALL")}
                          className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                            activeGroupFilter === "ALL"
                              ? "bg-[var(--ink)] text-[var(--bg)]"
                              : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          }`}
                        >
                          Semua ({contacts.length})
                        </button>
                        {contactGroups.map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setActiveGroupFilter(grp)}
                            className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                              activeGroupFilter === grp
                                ? "bg-[var(--ink)] text-[var(--bg)]"
                                : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
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

                    <div className="custom-scrollbar grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {visibleContacts.map((contact) => {
                        const checked = selectedContactIds.includes(contact.id);
                        return (
                          <label
                            key={contact.id}
                            className={`flex min-h-[46px] items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                              checked
                                ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                                : "border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
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
                  </div>
                )}

                <div>
                  <label
                    htmlFor="manual-email-input"
                    className="block text-xs font-semibold text-[var(--ink)]"
                  >
                    Tambah email manual (opsional)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="manual-email-input"
                      type="email"
                      value={manualEmailInput}
                      onChange={(event) => {
                        setManualEmailInput(event.target.value);
                        if (manualEmailError) setManualEmailError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addManualEmailChip(manualEmailInput);
                        }
                      }}
                      placeholder="teman@email.com lalu tekan Enter"
                      className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => addManualEmailChip(manualEmailInput)}
                      className="min-h-[44px] shrink-0 rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                    >
                      Tambah
                    </button>
                  </div>

                  {manualEmailError ? (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-fg)]">
                      {manualEmailError}
                    </p>
                  ) : null}

                  {manualEmails.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {manualEmails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-elevated)] py-1 pr-1.5 pl-2.5 text-xs font-medium text-[var(--ink)]"
                        >
                          <span>{email}</span>
                          <button
                            type="button"
                            onClick={() => removeManualEmail(email)}
                            aria-label={`Hapus ${email}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--surface)]"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section
            aria-labelledby="email-style-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono-num inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-tint)] text-xs font-bold text-[var(--accent)]">
                2
              </span>
              <h2
                id="email-style-heading"
                className="font-display text-lg font-semibold text-[var(--ink)] sm:text-xl"
              >
                Tampilan &amp; Pesan Email
              </h2>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="itinerary-sender-name"
                    className="block text-xs font-semibold text-[var(--ink)]"
                  >
                    Nama Pengirim Email
                  </label>
                  {senderName.trim() !== defaultSenderName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSenderName(defaultSenderName);
                        setSenderDirty(false);
                      }}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      Pakai default ({defaultSenderName})
                    </button>
                  ) : null}
                </div>
                <input
                  id="itinerary-sender-name"
                  type="text"
                  maxLength={60}
                  value={senderName}
                  onChange={(event) => {
                    setSenderName(event.target.value);
                    setSenderDirty(true);
                  }}
                  placeholder={defaultSenderName}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-[var(--ink)]">
                  Kategori Kegiatan (Badge Email)
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {activeCategoryPresets.map((preset) => {
                    const active = !categoryIsCustom && categoryLabel === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setCategoryLabel(preset);
                          setCategoryIsCustom(false);
                        }}
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
                    onClick={() => setCategoryIsCustom(true)}
                    className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      categoryIsCustom
                        ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Tulis Sendiri
                  </button>
                </div>

                {categoryIsCustom ? (
                  <input
                    id="itinerary-custom-category"
                    type="text"
                    maxLength={40}
                    value={categoryLabel}
                    onChange={(event) => setCategoryLabel(event.target.value)}
                    placeholder="Contoh: Syukuran Rumah, Rapat Tim, Roadtrip..."
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                  />
                ) : null}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="block text-xs font-semibold text-[var(--ink)]">
                    Gaya Bahasa &amp; Pesan Pembuka
                  </span>
                  {introEditedManually ? (
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
                  {(
                    [
                      { value: "formal", label: "Formal" },
                      { value: "natural", label: "Natural" },
                      { value: "casual", label: "Santai" },
                      { value: "custom", label: "Tulis Sendiri" },
                    ] as const
                  ).map((item) => {
                    const active = messageTone === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleSelectTone(item.value)}
                        className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)]"
                            : "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  id="itinerary-intro-message"
                  rows={3}
                  maxLength={600}
                  value={introMessage}
                  onChange={(event) => {
                    setIntroMessage(event.target.value);
                    setIntroEditedManually(true);
                  }}
                  placeholder="Tulis pesan pembuka undangan di sini..."
                  className="mt-2 w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                />
                <p className="mt-1 text-right font-mono-num text-[11px] text-[var(--ink-muted)]">
                  {introMessage.length} / 600
                </p>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="sessions-builder-heading"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-xs sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono-num inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-tint)] text-xs font-bold text-[var(--accent)]">
                  3
                </span>
                <h2
                  id="sessions-builder-heading"
                  className="font-display text-lg font-semibold text-[var(--ink)] sm:text-xl"
                >
                  Detail &amp; Rangkaian Sesi
                </h2>
              </div>
              <span className="font-mono-num text-xs text-[var(--ink-muted)]">
                WIB · {sessions.length} sesi
              </span>
            </div>

            <div className="mt-4">
              <label
                htmlFor="itinerary-subject"
                className="block text-sm font-semibold text-[var(--ink)]"
              >
                Judul Undangan
              </label>
              <input
                id="itinerary-subject"
                type="text"
                required
                maxLength={180}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Contoh: Malam Minggu di Tunjungan / Ngopi & Nonton Bareng"
                className="mt-1.5 min-h-[46px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
              />
            </div>

            <div className="mt-5 space-y-3">
              {sessions.map((session, index) => {
                const crossesMidnight =
                  isValidHmTime(session.startTime) &&
                  isValidHmTime(session.endTime) &&
                  session.endTime < session.startTime;
                const sameTimeError =
                  isValidHmTime(session.startTime) &&
                  isValidHmTime(session.endTime) &&
                  session.endTime === session.startTime;

                let durationBadge: string | null = null;
                if (
                  isValidYmdDate(session.date) &&
                  isValidHmTime(session.startTime) &&
                  isValidHmTime(session.endTime) &&
                  !sameTimeError
                ) {
                  try {
                    const r = resolveWibSessionUtcRange(
                      session.date,
                      session.startTime,
                      session.endTime,
                    );
                    durationBadge = formatDurationIndonesian(r.durationMinutes);
                  } catch {
                    durationBadge = null;
                  }
                }

                const hasExtraValues = Boolean(
                  session.mapsUrl?.trim() || session.description?.trim(),
                );
                const extrasOpen = expandedExtras[session.draftId] ?? hasExtraValues;

                const nextSession = sessions[index + 1];
                const gapLabel = nextSession ? computeGapLabel(session, nextSession) : null;

                return (
                  <div key={session.draftId} className="space-y-3">
                    <div className="relative pl-8 before:absolute before:top-7 before:bottom-[-12px] before:left-[11px] before:w-0.5 before:bg-[var(--border-subtle)] last:before:hidden">
                      <span
                        aria-hidden="true"
                        className="font-mono-num absolute top-4 left-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent-tint)] text-xs font-bold text-[var(--accent)]"
                      >
                        {index + 1}
                      </span>

                      <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
                        <div className="flex items-center justify-between gap-2 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-[var(--ink)]">
                              Sesi {index + 1}
                            </h3>
                            {durationBadge ? (
                              <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                                {durationBadge}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveSession(index, -1)}
                              disabled={index === 0}
                              aria-label={`Pindahkan Sesi ${index + 1} ke atas`}
                              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                            >
                              <ArrowUp className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSession(index, 1)}
                              disabled={index === sessions.length - 1}
                              aria-label={`Pindahkan Sesi ${index + 1} ke bawah`}
                              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                            >
                              <ArrowDown className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                            </button>
                            {sessions.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeSession(session.draftId)}
                                aria-label={`Hapus Sesi ${index + 1}`}
                                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:opacity-85"
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor={`session-title-${session.draftId}`}
                                className="block text-xs font-semibold text-[var(--ink)]"
                              >
                                Nama Kegiatan *
                              </label>
                              <input
                                id={`session-title-${session.draftId}`}
                                type="text"
                                required
                                maxLength={140}
                                value={session.title}
                                onChange={(event) =>
                                  updateSession(session.draftId, { title: event.target.value })
                                }
                                placeholder="Makan malam / Nonton"
                                className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`session-location-${session.draftId}`}
                                className="block text-xs font-semibold text-[var(--ink)]"
                              >
                                Lokasi
                              </label>
                              <input
                                id={`session-location-${session.draftId}`}
                                type="text"
                                maxLength={180}
                                value={session.locationName ?? ""}
                                onChange={(event) =>
                                  updateSession(session.draftId, { locationName: event.target.value })
                                }
                                placeholder="Nama kafe / bioskop"
                                className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div>
                              <label
                                htmlFor={`session-date-${session.draftId}`}
                                className="block text-xs font-semibold text-[var(--ink)]"
                              >
                                Tanggal *
                              </label>
                              <input
                                id={`session-date-${session.draftId}`}
                                type="date"
                                required
                                value={session.date}
                                onChange={(event) =>
                                  updateSession(session.draftId, { date: event.target.value })
                                }
                                className="font-mono-num mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`session-start-${session.draftId}`}
                                className="block text-xs font-semibold text-[var(--ink)]"
                              >
                                Mulai (WIB) *
                              </label>
                              <input
                                id={`session-start-${session.draftId}`}
                                type="time"
                                required
                                value={session.startTime}
                                onChange={(event) =>
                                  updateSession(session.draftId, { startTime: event.target.value })
                                }
                                className="font-mono-num mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`session-end-${session.draftId}`}
                                className="block text-xs font-semibold text-[var(--ink)]"
                              >
                                Selesai (WIB) *
                              </label>
                              <input
                                id={`session-end-${session.draftId}`}
                                type="time"
                                required
                                value={session.endTime}
                                onChange={(event) =>
                                  updateSession(session.draftId, { endTime: event.target.value })
                                }
                                className="font-mono-num mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                              />
                            </div>
                          </div>

                          {crossesMidnight ? (
                            <p className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--warning-fg)]">
                              Otomatis dihitung lintas tengah malam (+1 hari).
                            </p>
                          ) : null}

                          {sameTimeError ? (
                            <p
                              role="alert"
                              className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--danger-fg)]"
                            >
                              Jam selesai harus berbeda dari jam mulai.
                            </p>
                          ) : null}

                          <button
                            type="button"
                            aria-expanded={extrasOpen}
                            onClick={() =>
                              setExpandedExtras((prev) => ({
                                ...prev,
                                [session.draftId]: !extrasOpen,
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                extrasOpen ? "rotate-180" : ""
                              }`}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                            <span>
                              {extrasOpen
                                ? "Sembunyikan Maps & catatan"
                                : "+ Tambah link Google Maps & catatan"}
                            </span>
                          </button>

                          {extrasOpen ? (
                            <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                              <div>
                                <label
                                  htmlFor={`session-maps-${session.draftId}`}
                                  className="block text-xs font-semibold text-[var(--ink)]"
                                >
                                  Link Google Maps
                                </label>
                                <input
                                  id={`session-maps-${session.draftId}`}
                                  type="url"
                                  maxLength={500}
                                  value={session.mapsUrl ?? ""}
                                  onChange={(event) =>
                                    updateSession(session.draftId, { mapsUrl: event.target.value })
                                  }
                                  placeholder="https://maps.google.com/..."
                                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`session-desc-${session.draftId}`}
                                  className="block text-xs font-semibold text-[var(--ink)]"
                                >
                                  Catatan Tambahan
                                </label>
                                <textarea
                                  id={`session-desc-${session.draftId}`}
                                  rows={2}
                                  maxLength={1200}
                                  value={session.description ?? ""}
                                  onChange={(event) =>
                                    updateSession(session.draftId, {
                                      description: event.target.value,
                                    })
                                  }
                                  placeholder="Dress code, titik kumpul, atau catatan parkir..."
                                  className="mt-1 w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    </div>

                    {gapLabel ? (
                      <div className="pl-8">
                        <span className="inline-block rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                          {gapLabel} ke Sesi {index + 2}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addNextSession}
              disabled={sessions.length >= 15}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-control)] bg-[var(--surface-elevated)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] active:scale-[0.99] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>Tambah Sesi Berikutnya</span>
            </button>

            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="alarm-select"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Pengingat sebelum acara
                </label>
                <select
                  id="alarm-select"
                  value={alarmMinutes}
                  onChange={(event) =>
                    setAlarmMinutes(Number(event.target.value) as AlarmMinutes)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-sm text-[var(--ink)]"
                >
                  <option value={15}>15 menit sebelumnya</option>
                  <option value={30}>30 menit sebelumnya</option>
                  <option value={60}>1 jam sebelumnya</option>
                </select>
              </div>

              {sessions.length > 1 ? (
                <div>
                  <label
                    htmlFor="ics-mode-select"
                    className="block text-xs font-semibold text-[var(--ink)]"
                  >
                    Cara kirim kalender ({sessions.length} sesi)
                  </label>
                  <select
                    id="ics-mode-select"
                    value={icsMode}
                    onChange={(event) =>
                      setIcsMode(event.target.value as IcsBundleMode)
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-[var(--border-control)] bg-[var(--surface-elevated)] px-3 text-sm text-[var(--ink)]"
                  >
                    <option value="combined">Semua sesi dalam 1 file kalender</option>
                    <option value="separate">Terpisah 1 file per sesi</option>
                  </select>
                </div>
              ) : null}
            </div>
          </section>

          {feedback ? (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
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
          ) : null}

          <button
            type="submit"
            disabled={submitting || exceedsRecipientLimit}
            className="btn-primary-accent inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold transition-colors active:scale-[0.99] disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>
              {submitting
                ? "Mengirim Undangan & Kalender..."
                : `Kirim Undangan & Sinkronkan Kalender (${effectiveRecipientCount} Penerima)`}
            </span>
          </button>
        </form>

        <div className="hidden lg:col-span-5 lg:block">
          <ItineraryPreview
            mode={mode}
            senderName={senderName}
            categoryLabel={categoryLabel}
            introMessage={introMessage}
            recipientCount={effectiveRecipientCount}
            partnerName={partnerName}
            subject={subject || sessions[0]?.title || ""}
            alarmMinutes={alarmMinutes}
            icsMode={icsMode}
            sessions={sessions}
          />
        </div>
      </div>

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
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-[var(--border-subtle)] bg-[var(--bg)] p-4"
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
              senderName={senderName}
              categoryLabel={categoryLabel}
              introMessage={introMessage}
              recipientCount={effectiveRecipientCount}
              partnerName={partnerName}
              subject={subject || sessions[0]?.title || ""}
              alarmMinutes={alarmMinutes}
              icsMode={icsMode}
              sessions={sessions}
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
