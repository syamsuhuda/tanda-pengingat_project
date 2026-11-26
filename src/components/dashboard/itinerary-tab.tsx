"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Heart,
  Lock,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ContactsModal } from "@/components/dashboard/contacts-modal";
import { ItineraryPreview } from "@/components/dashboard/itinerary-preview";
import { isValidHmTime, isValidYmdDate, suggestNextSessionSlot } from "@/lib/timezone";
import type {
  AlarmMinutes,
  FriendContact,
  IcsBundleMode,
  ItineraryRecipientMode,
  ItinerarySessionInput,
} from "@/lib/types";

interface ItineraryTabProps {
  todayWib: string;
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

export function ItineraryTab({
  todayWib,
  partnerName,
  partnerEmail,
  contacts,
  contactGroups,
  onContactsChanged,
  onSentSuccess,
}: ItineraryTabProps) {
  const [mode, setMode] = useState<ItineraryRecipientMode>("date");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("ALL");
  const [manualEmailInput, setManualEmailInput] = useState("");
  const [manualEmails, setManualEmails] = useState<string[]>([]);
  const [manualEmailError, setManualEmailError] = useState<string | null>(null);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);

  const [subject, setSubject] = useState("");
  const [alarmMinutes, setAlarmMinutes] = useState<AlarmMinutes>(30);
  const [icsMode, setIcsMode] = useState<IcsBundleMode>("combined");
  const [sessions, setSessions] = useState<SessionDraft[]>(() => [
    createInitialSession(todayWib),
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
  const exceedsRecipientLimit = mode === "friends" && uniqueFriendsCount > MAX_RECIPIENTS;

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
    if (mode === "friends" && pendingEmail) {
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
        text: "Isi subjek email atau judul acara Sesi 1 terlebih dahulu.",
      });
      return;
    }

    if (mode === "friends" && effectiveRecipientCount === 0 && finalManualEmails.length === 0) {
      setFeedback({
        type: "error",
        text: "Pilih minimal satu kontak tersimpan atau tambahkan alamat email penerima.",
      });
      return;
    }

    if (exceedsRecipientLimit) {
      setFeedback({
        type: "error",
        text: `Maksimal ${MAX_RECIPIENTS} penerima unik dalam satu pengiriman.`,
      });
      return;
    }

    for (let i = 0; i < sessions.length; i += 1) {
      const s = sessions[i];
      if (!s) continue;
      if (!s.title.trim()) {
        setFeedback({ type: "error", text: `Judul acara pada Sesi ${i + 1} wajib diisi.` });
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

    try {
      const response = await fetch("/api/itinerary/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          contactIds: mode === "friends" ? selectedContactIds : [],
          manualEmails: mode === "friends" ? finalManualEmails : [],
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
        text: `${body.message ?? "Undangan berhasil dikirim."}${files ? ` Lampiran: ${files}.` : ""}`,
      });
      await onSentSuccess();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat mengirim undangan. Coba kembali beberapa saat lagi.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
          Generator Undangan Itinerary & Acara
        </h1>
        <p className="text-sm text-[var(--ink-muted)]">
          Susun satu acara atau rangkaian multi-sesi WIB dan kirim langsung sebagai undangan kalender Google (.ics).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-7" noValidate>
          <section
            aria-labelledby="recipient-mode-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <h2
              id="recipient-mode-heading"
              className="font-display text-xl font-semibold text-[var(--ink)]"
            >
              Penerima Undangan
            </h2>

            <div
              role="radiogroup"
              aria-label="Mode penerima undangan"
              className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "date"}
                onClick={() => setMode("date")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors ${
                  mode === "date"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Heart className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
                <span>Date Itinerary</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={mode === "friends"}
                onClick={() => setMode("friends")}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors ${
                  mode === "friends"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs ring-1 ring-[var(--border-subtle)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Users className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
                <span>Acara / Hangout Teman</span>
              </button>
            </div>

            {mode === "date" ? (
              <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-[var(--border-control)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                  <Lock className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">
                    {partnerName} ({partnerEmail})
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Mode Date Itinerary mengunci penerima secara otomatis ke email pasangan di sisi server.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`font-mono-num text-xs font-semibold ${
                      exceedsRecipientLimit ? "text-[var(--danger-fg)]" : "text-[var(--ink-muted)]"
                    }`}
                  >
                    {uniqueFriendsCount} / {MAX_RECIPIENTS} penerima unik (1 transaksi SMTP)
                  </p>
                  <button
                    type="button"
                    onClick={() => setContactsModalOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    <span>Kelola Kontak</span>
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-muted)]">
                    Belum ada kontak teman tersimpan. Klik <strong>Kelola Kontak</strong> untuk menyimpan kontak beserta grupnya, atau ketik email manual di bawah.
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter grup kontak">
                        <button
                          type="button"
                          onClick={() => setActiveGroupFilter("ALL")}
                          className={`min-h-[36px] rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                            activeGroupFilter === "ALL"
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                              : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--bg)]"
                          }`}
                        >
                          Semua ({contacts.length})
                        </button>
                        {contactGroups.map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setActiveGroupFilter(grp)}
                            className={`min-h-[36px] rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                              activeGroupFilter === grp
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                                : "border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--bg)]"
                            }`}
                          >
                            {grp}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllVisibleGroup}
                          className="min-h-[36px] text-xs font-semibold text-[var(--accent)] hover:underline"
                        >
                          Pilih Semua
                        </button>
                        <span className="text-[var(--ink-muted)]" aria-hidden="true">
                          /
                        </span>
                        <button
                          type="button"
                          onClick={clearVisibleGroupSelection}
                          className="min-h-[36px] text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline"
                        >
                          Hapus Pilihan
                        </button>
                      </div>
                    </div>

                    <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {visibleContacts.map((contact) => {
                        const checked = selectedContactIds.includes(contact.id);
                        return (
                          <label
                            key={contact.id}
                            className={`flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                              checked
                                ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                                : "border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--bg)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleContact(contact.id)}
                              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-[var(--ink)]">
                                {contact.name}
                              </span>
                              <span className="block truncate text-xs text-[var(--ink-muted)]">
                                {contact.email} &middot; {contact.group}
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
                    className="block text-sm font-semibold text-[var(--ink)]"
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
                      placeholder="email@example.com lalu tekan Enter"
                      className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => addManualEmailChip(manualEmailInput)}
                      className="min-h-[44px] shrink-0 rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
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
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-control)] bg-[var(--surface-muted)] py-1 pr-1.5 pl-2.5 text-xs font-medium text-[var(--ink)]"
                        >
                          <span>{email}</span>
                          <button
                            type="button"
                            onClick={() => removeManualEmail(email)}
                            aria-label={`Hapus ${email}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--surface)]"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
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
            aria-labelledby="general-options-heading"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6"
          >
            <h2
              id="general-options-heading"
              className="font-display text-xl font-semibold text-[var(--ink)]"
            >
              Pengaturan Undangan
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="itinerary-subject"
                  className="block text-sm font-semibold text-[var(--ink)]"
                >
                  Subjek Email
                </label>
                <input
                  id="itinerary-subject"
                  type="text"
                  required
                  maxLength={180}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Contoh: Rencana Akhir Pekan di Bandung"
                  className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="alarm-select"
                    className="block text-sm font-semibold text-[var(--ink)]"
                  >
                    Pengingat Default (VALARM)
                  </label>
                  <select
                    id="alarm-select"
                    value={alarmMinutes}
                    onChange={(event) =>
                      setAlarmMinutes(Number(event.target.value) as AlarmMinutes)
                    }
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                  >
                    <option value={15}>15 menit sebelum acara</option>
                    <option value={30}>30 menit sebelum acara</option>
                    <option value={60}>1 jam sebelum acara</option>
                  </select>
                </div>

                {sessions.length > 1 ? (
                  <div>
                    <label
                      htmlFor="ics-mode-select"
                      className="block text-sm font-semibold text-[var(--ink)]"
                    >
                      Format Lampiran .ics ({sessions.length} sesi)
                    </label>
                    <select
                      id="ics-mode-select"
                      value={icsMode}
                      onChange={(event) =>
                        setIcsMode(event.target.value as IcsBundleMode)
                      }
                      className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                    >
                      <option value="combined">1 file .ics gabungan</option>
                      <option value="separate">File .ics terpisah per sesi</option>
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section aria-labelledby="sessions-builder-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="sessions-builder-heading"
                className="font-display text-xl font-semibold text-[var(--ink)]"
              >
                Rangkaian Sesi ({sessions.length})
              </h2>
              <span className="text-xs text-[var(--ink-muted)]">Waktu dalam WIB</span>
            </div>

            {sessions.map((session, index) => {
              const crossesMidnight =
                isValidHmTime(session.startTime) &&
                isValidHmTime(session.endTime) &&
                session.endTime < session.startTime;
              const sameTimeError =
                isValidHmTime(session.startTime) &&
                isValidHmTime(session.endTime) &&
                session.endTime === session.startTime;

              return (
                <article
                  key={session.draftId}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                    <h3 className="font-mono-num text-sm font-semibold text-[var(--accent)]">
                      Sesi {index + 1}
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSession(index, -1)}
                        disabled={index === 0}
                        aria-label={`Pindahkan Sesi ${index + 1} ke atas`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                      >
                        <ArrowUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSession(index, 1)}
                        disabled={index === sessions.length - 1}
                        aria-label={`Pindahkan Sesi ${index + 1} ke bawah`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-35"
                      >
                        <ArrowDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      {sessions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeSession(session.draftId)}
                          aria-label={`Hapus Sesi ${index + 1}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:opacity-85"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    <div>
                      <label
                        htmlFor={`session-title-${session.draftId}`}
                        className="block text-sm font-semibold text-[var(--ink)]"
                      >
                        Judul Acara *
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
                        placeholder="Contoh: Makan Malam & Kopi Santai"
                        className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`session-date-${session.draftId}`}
                          className="block text-sm font-semibold text-[var(--ink)]"
                        >
                          Tanggal (WIB) *
                        </label>
                        <input
                          id={`session-date-${session.draftId}`}
                          type="date"
                          required
                          value={session.date}
                          onChange={(event) =>
                            updateSession(session.draftId, { date: event.target.value })
                          }
                          className="font-mono-num mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`session-start-${session.draftId}`}
                          className="block text-sm font-semibold text-[var(--ink)]"
                        >
                          Jam Mulai *
                        </label>
                        <input
                          id={`session-start-${session.draftId}`}
                          type="time"
                          required
                          value={session.startTime}
                          onChange={(event) =>
                            updateSession(session.draftId, { startTime: event.target.value })
                          }
                          className="font-mono-num mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`session-end-${session.draftId}`}
                          className="block text-sm font-semibold text-[var(--ink)]"
                        >
                          Jam Selesai *
                        </label>
                        <input
                          id={`session-end-${session.draftId}`}
                          type="time"
                          required
                          value={session.endTime}
                          onChange={(event) =>
                            updateSession(session.draftId, { endTime: event.target.value })
                          }
                          className="font-mono-num mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                        />
                      </div>
                    </div>

                    {crossesMidnight ? (
                      <p className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--warning-fg)]">
                        Jam selesai lebih awal dari jam mulai: otomatis dihitung lintas tengah malam (+1 hari).
                      </p>
                    ) : null}

                    {sameTimeError ? (
                      <p
                        role="alert"
                        className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--danger-fg)]"
                      >
                        Jam selesai harus berbeda dari jam mulai.
                      </p>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`session-location-${session.draftId}`}
                          className="block text-sm font-semibold text-[var(--ink)]"
                        >
                          Nama Lokasi
                        </label>
                        <input
                          id={`session-location-${session.draftId}`}
                          type="text"
                          maxLength={180}
                          value={session.locationName ?? ""}
                          onChange={(event) =>
                            updateSession(session.draftId, { locationName: event.target.value })
                          }
                          placeholder="Nama tempat atau alamat"
                          className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`session-maps-${session.draftId}`}
                          className="block text-sm font-semibold text-[var(--ink)]"
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
                          className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`session-desc-${session.draftId}`}
                        className="block text-sm font-semibold text-[var(--ink)]"
                      >
                        Deskripsi / Catatan
                      </label>
                      <textarea
                        id={`session-desc-${session.draftId}`}
                        rows={2}
                        maxLength={1200}
                        value={session.description ?? ""}
                        onChange={(event) =>
                          updateSession(session.draftId, { description: event.target.value })
                        }
                        placeholder="Dress code, titik kumpul, atau catatan parkir..."
                        className="mt-1.5 w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3.5 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]"
                      />
                    </div>
                  </div>
                </article>
              );
            })}

            <button
              type="button"
              onClick={addNextSession}
              disabled={sessions.length >= 15}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-control)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Tambah Sesi Berikutnya</span>
            </button>
          </section>

          {feedback ? (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
                feedback.type === "error"
                  ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                  : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]"
              }`}
            >
              {feedback.type === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{feedback.text}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || exceedsRecipientLimit}
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>
              {submitting
                ? "Mengirim Undangan & Kalender..."
                : `Kirim Undangan (${effectiveRecipientCount} Penerima)`}
            </span>
          </button>
        </form>

        <div className="lg:col-span-5">
          <ItineraryPreview
            mode={mode}
            recipientCount={effectiveRecipientCount}
            partnerName={partnerName}
            subject={subject || sessions[0]?.title || ""}
            alarmMinutes={alarmMinutes}
            icsMode={icsMode}
            sessions={sessions}
          />
        </div>
      </div>

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
