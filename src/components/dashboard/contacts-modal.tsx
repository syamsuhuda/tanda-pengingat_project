"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { FriendContact } from "@/lib/types";

interface ContactsModalProps {
  open: boolean;
  contacts: FriendContact[];
  groups: string[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export function ContactsModal({
  open,
  contacts,
  groups,
  onClose,
  onChanged,
}: ContactsModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [group, setGroup] = useState("Umum");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    );
  }, [contacts, searchQuery]);

  if (!open) {
    return null;
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setWhatsapp("");
    setGroup("Umum");
  }

  function startEdit(contact: FriendContact) {
    setEditingId(contact.id);
    setName(contact.name);
    setEmail(contact.email);
    setWhatsapp(contact.whatsapp ?? "");
    setGroup(contact.group);
    setFeedback(null);
    nameInputRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const endpoint = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          group: group.trim() || "Umum",
        }),
      });

      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menyimpan data kontak.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text:
          body.message ??
          (editingId ? "Kontak berhasil diperbarui." : "Kontak baru berhasil ditambahkan."),
      });
      resetForm();
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menyimpan kontak.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFeedback({
          type: "error",
          text: body.message ?? "Gagal menghapus kontak.",
        });
        return;
      }

      if (editingId === id) {
        resetForm();
      }
      setConfirmDeleteId(null);
      setFeedback({
        type: "success",
        text: body.message ?? "Kontak berhasil dihapus.",
      });
      await onChanged();
    } catch {
      setFeedback({
        type: "error",
        text: "Koneksi gagal saat menghapus kontak.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contacts-modal-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2
              id="contacts-modal-title"
              className="font-display text-xl font-semibold text-[var(--ink)]"
            >
              Kelola Kontak Undangan
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              Simpan kontak teman, keluarga, rekan kerja, atau komunitas per grup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal kelola kontak"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {editingId ? "Edit Kontak" : "Tambah Kontak Baru"}
              </h3>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Batal Edit
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Nama
                </label>
                <input
                  ref={nameInputRef}
                  id="contact-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nama panggilan"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  maxLength={160}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@email.com"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-whatsapp"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  WhatsApp <span className="font-normal text-[var(--ink-muted)]">(Opsional)</span>
                </label>
                <input
                  id="contact-whatsapp"
                  type="tel"
                  inputMode="numeric"
                  maxLength={30}
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-group"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Nama Grup
                </label>
                <input
                  id="contact-group"
                  type="text"
                  list="contact-group-suggestions"
                  required
                  maxLength={50}
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                  placeholder="Kantor, Kuliah, Umum"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:text-sm"
                />
                <datalist id="contact-group-suggestions">
                  {Array.from(
                    new Set(["Umum", "Teman", "Keluarga", "Rekan Kerja", "Komunitas", ...groups]),
                  ).map(
                    (g) => (
                      <option key={g} value={g} />
                    ),
                  )}
                </datalist>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {submitting
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Tambah Kontak"}
                </span>
              </button>
            </div>
          </form>

          {feedback ? (
            <div
              role={feedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ${feedback.type === "error"
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

          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Daftar Tersimpan ({contacts.length})
              </h3>
              <div className="sm:w-64">
                <label htmlFor="contact-search" className="sr-only">
                  Cari kontak
                </label>
                <input
                  id="contact-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari nama, email, atau grup..."
                  className="min-h-[44px] w-full rounded-lg border border-[var(--border-control)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] sm:min-h-[40px] sm:text-sm"
                />
              </div>
            </div>

            {filteredContacts.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5 text-center text-sm text-[var(--ink-muted)]">
                {contacts.length === 0
                  ? "Belum ada kontak tersimpan. Tambahkan kontak pertama Anda lewat form di atas."
                  : "Tidak ada kontak yang cocok dengan pencarian Anda."}
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
                {filteredContacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--ink)]">{contact.name}</span>
                        <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ink-muted)]">
                          {contact.group}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[var(--ink-muted)]">{contact.email}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(contact)}
                        aria-label={`Edit ${contact.name}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--border-control)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>

                      {confirmDeleteId === contact.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingId === contact.id}
                            onClick={() => void handleDelete(contact.id)}
                            className="min-h-[44px] rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            {deletingId === contact.id ? "Menghapus..." : "Hapus"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[44px] rounded-lg border border-[var(--border-control)] px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(contact.id)}
                          aria-label={`Hapus ${contact.name}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:opacity-85"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
