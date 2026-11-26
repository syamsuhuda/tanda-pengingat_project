import { z } from "zod";
import { hmTimeToMinutes, isValidHmTime, isValidYmdDate } from "./timezone";

export const ymdDateSchema = z
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

export const strictSixDigitPinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "PIN harus tepat 6 digit angka");

export const loginSchema = z.object({
  pin: z.string().trim().min(4, "PIN minimal 4 karakter").max(64, "PIN terlalu panjang"),
});

export const changePinSchema = z
  .object({
    currentPin: z
      .string()
      .trim()
      .min(4, "PIN saat ini minimal 4 karakter")
      .max(64, "PIN saat ini terlalu panjang"),
    newPin: strictSixDigitPinSchema,
    confirmNewPin: strictSixDigitPinSchema,
  })
  .refine((data) => data.newPin === data.confirmNewPin, {
    message: "Konfirmasi PIN baru tidak cocok",
    path: ["confirmNewPin"],
  })
  .refine((data) => data.newPin !== data.currentPin, {
    message: "PIN baru tidak boleh sama dengan PIN saat ini",
    path: ["newPin"],
  });

export const forgotPinRequestSchema = z.object({});

export const forgotPinResetSchema = z
  .object({
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Kode verifikasi harus tepat 6 digit angka"),
    newPin: strictSixDigitPinSchema,
    confirmNewPin: strictSixDigitPinSchema,
  })
  .refine((data) => data.newPin === data.confirmNewPin, {
    message: "Konfirmasi PIN baru tidak cocok",
    path: ["confirmNewPin"],
  });

export const cronAttendanceSchema = z.object({
  stage: z.enum(["auto", "morning", "afternoon", "urgent"]).default("auto"),
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
  customNote: z
    .string()
    .trim()
    .max(500, "Catatan tambahan maksimal 500 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  note: z
    .string()
    .trim()
    .max(500, "Catatan tambahan maksimal 500 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  senderName: z
    .string()
    .trim()
    .min(1, "Nama pengirim minimal 1 karakter")
    .max(60, "Nama pengirim maksimal 60 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  useActiveMessage: z.boolean().optional().default(false),
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

export const recipientConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama pasangan wajib diisi")
    .max(60, "Nama pasangan maksimal 60 karakter"),
  email: z.string().trim().email("Format email pasangan tidak valid").max(160),
});

export const senderConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama pengirim wajib diisi")
    .max(60, "Nama pengirim maksimal 60 karakter"),
});

export const customMessageSchema = z.object({
  message: z.string().trim().max(500, "Pesan khusus maksimal 500 karakter"),
  scope: z.enum(["today_only", "always"]).default("today_only"),
});

export const addOffDaysSchema = z.object({
  dates: z
    .array(ymdDateSchema)
    .min(1, "Pilih minimal satu tanggal libur")
    .max(31, "Maksimal 31 tanggal dalam satu permintaan"),
  note: z
    .string()
    .trim()
    .max(160, "Catatan libur maksimal 160 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
});

const scheduleStageSchema = z.object({
  enabled: z.boolean(),
  time: hmTimeSchema,
});

export const scheduleConfigSchema = z
  .object({
    morning: scheduleStageSchema,
    afternoon: scheduleStageSchema,
    urgent: scheduleStageSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.morning.enabled && !data.afternoon.enabled && !data.urgent.enabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimal satu tahap pengingat harus aktif.",
        path: ["morning"],
      });
      return;
    }

    const morningMin = hmTimeToMinutes(data.morning.time);
    const afternoonMin = hmTimeToMinutes(data.afternoon.time);
    const urgentMin = hmTimeToMinutes(data.urgent.time);

    if (data.morning.enabled && data.afternoon.enabled && morningMin >= afternoonMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Jam Pengingat Pagi harus lebih awal dari jam Pengecekan Sore.",
        path: ["afternoon", "time"],
      });
    }

    if (data.afternoon.enabled && data.urgent.enabled && afternoonMin >= urgentMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Jam Pengecekan Sore harus lebih awal dari jam Peringatan Urgent.",
        path: ["urgent", "time"],
      });
    }

    if (data.morning.enabled && data.urgent.enabled && morningMin >= urgentMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Jam Pengingat Pagi harus lebih awal dari jam Peringatan Urgent.",
        path: ["urgent", "time"],
      });
    }
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
  mode: z.enum(["date", "event", "friends"]),
  contactIds: z.array(z.string().trim().min(1)).max(30).default([]),
  manualEmails: z
    .array(z.string().trim().email("Salah satu email manual tidak valid").max(160))
    .max(30)
    .default([]),
  senderName: z
    .string()
    .trim()
    .min(1, "Nama pengirim minimal 1 karakter")
    .max(60, "Nama pengirim maksimal 60 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  categoryLabel: z
    .string()
    .trim()
    .min(1, "Kategori acara minimal 1 karakter")
    .max(40, "Kategori acara maksimal 40 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
  messageTone: z.enum(["formal", "natural", "casual", "custom"]).optional().default("natural"),
  customIntroMessage: z
    .string()
    .trim()
    .max(600, "Pesan pembuka maksimal 600 karakter")
    .optional()
    .transform((val) => (val ? val : undefined)),
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
