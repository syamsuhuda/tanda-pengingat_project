import { z } from "zod";
import { isValidHmTime, isValidYmdDate } from "./timezone";

const ymdDateSchema = z
  .string()
  .trim()
  .refine(isValidYmdDate, "Format tanggal harus YYYY-MM-DD yang valid");

const hmTimeSchema = z
  .string()
  .trim()
  .refine(isValidHmTime, "Format jam harus HH:mm (00:00 sampai 23:59)");

const optionalMapsUrlSchema = z
  .string()
  .trim()
  .max(500, "Link Google Maps maksimal 500 karakter")
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    "Link Google Maps harus diawali http:// atau https://",
  )
  .optional()
  .transform((val) => (val ? val : undefined));

export const loginSchema = z.object({
  pin: z.string().trim().min(4, "PIN minimal 4 karakter").max(64, "PIN terlalu panjang"),
});

export const cronAttendanceSchema = z.object({
  stage: z.enum(["morning", "afternoon", "urgent"]),
});

export const confirmAttendanceSchema = z.union([
  z.object({
    date: ymdDateSchema,
    token: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, "Token konfirmasi tidak valid"),
  }),
  z.object({
    manual: z.literal(true),
    date: ymdDateSchema.optional(),
  }),
]);

export const triggerAttendanceSchema = z.object({
  note: z
    .string()
    .trim()
    .max(400, "Catatan tambahan maksimal 400 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  includeIcs: z.boolean().default(true),
  forceSend: z.boolean().default(false),
});

export const pauseConfigSchema = z.object({
  paused: z.boolean(),
  note: z
    .string()
    .trim()
    .max(240, "Catatan jeda maksimal 240 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
});

export const resetAttendanceSchema = z.object({
  clearSentLocks: z.boolean().optional().default(false),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1, "Nama kontak wajib diisi").max(80, "Nama maksimal 80 karakter"),
  email: z.string().trim().email("Format email tidak valid").max(160),
  group: z
    .string()
    .trim()
    .min(1, "Nama grup wajib diisi")
    .max(50, "Nama grup maksimal 50 karakter")
    .default("Umum"),
});

export const updateContactSchema = z
  .object({
    name: z.string().trim().min(1, "Nama kontak wajib diisi").max(80).optional(),
    email: z.string().trim().email("Format email tidak valid").max(160).optional(),
    group: z.string().trim().min(1, "Nama grup wajib diisi").max(50).optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.email !== undefined || data.group !== undefined,
    "Minimal satu field harus diubah",
  );

export const itinerarySessionSchema = z
  .object({
    title: z.string().trim().min(1, "Judul acara wajib diisi").max(140, "Judul maksimal 140 karakter"),
    date: ymdDateSchema,
    startTime: hmTimeSchema,
    endTime: hmTimeSchema,
    locationName: z
      .string()
      .trim()
      .max(180, "Nama lokasi maksimal 180 karakter")
      .optional()
      .transform((val) => (val ? val : undefined)),
    mapsUrl: optionalMapsUrlSchema,
    description: z
      .string()
      .trim()
      .max(1200, "Deskripsi maksimal 1200 karakter")
      .optional()
      .transform((val) => (val ? val : undefined)),
  })
  .refine((session) => session.startTime !== session.endTime, {
    message: "Jam selesai tidak boleh sama dengan jam mulai",
    path: ["endTime"],
  });

export const sendItinerarySchema = z.object({
  mode: z.enum(["date", "friends"]),
  contactIds: z.array(z.string().trim().min(1)).max(30).default([]),
  manualEmails: z
    .array(z.string().trim().email("Salah satu email manual tidak valid").max(160))
    .max(30)
    .default([]),
  subject: z
    .string()
    .trim()
    .min(1, "Subjek email wajib diisi")
    .max(180, "Subjek maksimal 180 karakter"),
  alarmMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  icsMode: z.enum(["combined", "separate"]).default("combined"),
  sessions: z
    .array(itinerarySessionSchema)
    .min(1, "Minimal harus ada 1 sesi acara")
    .max(15, "Maksimal 15 sesi dalam satu itinerary"),
});
