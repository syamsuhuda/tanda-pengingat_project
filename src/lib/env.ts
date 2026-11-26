import { z } from "zod";

const envSchema = z.object({
  GMAIL_USER: z.string().trim().email("GMAIL_USER harus berupa alamat email valid"),
  // Google menampilkan App Password dalam blok spasi 4x4; hapus spasi agar SMTP selalu konsisten.
  GMAIL_APP_PASSWORD: z
    .string()
    .trim()
    .min(1, "GMAIL_APP_PASSWORD wajib diisi")
    .transform((value) => value.replace(/\s+/g, "")),
  SENDER_NAME: z.string().trim().min(1, "SENDER_NAME wajib diisi"),
  PARTNER_EMAIL: z.string().trim().email("PARTNER_EMAIL harus berupa alamat email valid"),
  PARTNER_NAME: z.string().trim().min(1, "PARTNER_NAME wajib diisi"),
  MY_EMAIL: z.string().trim().email("MY_EMAIL harus berupa alamat email valid"),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .trim()
    .url("UPSTASH_REDIS_REST_URL harus berupa URL REST yang valid"),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1, "UPSTASH_REDIS_REST_TOKEN wajib diisi"),
  APP_PIN_HASH: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, "APP_PIN_HASH harus berupa hash SHA-256 hex 64 karakter")
    .transform((value) => value.toLowerCase()),
  SESSION_SECRET: z
    .string()
    .trim()
    .min(32, "SESSION_SECRET minimal 32 karakter"),
  CRON_SECRET: z
    .string()
    .trim()
    .min(32, "CRON_SECRET minimal 32 karakter"),
  HMAC_SECRET: z
    .string()
    .trim()
    .min(32, "HMAC_SECRET minimal 32 karakter"),
  APP_URL: z
    .string()
    .trim()
    .url("APP_URL harus berupa URL valid")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export class EnvConfigurationError extends Error {
  public readonly missingKeys: string[];

  constructor(message: string, missingKeys: string[]) {
    super(message);
    this.name = "EnvConfigurationError";
    this.missingKeys = missingKeys;
  }
}

// Validasi dilakukan lazy saat runtime agar proses `next build` tidak gagal ketika env belum terisi.
export function getEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("Server environment tidak boleh diakses dari sisi client.");
  }

  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse({
    GMAIL_USER: process.env.GMAIL_USER,
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
    SENDER_NAME: process.env.SENDER_NAME,
    PARTNER_EMAIL: process.env.PARTNER_EMAIL,
    PARTNER_NAME: process.env.PARTNER_NAME,
    MY_EMAIL: process.env.MY_EMAIL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    APP_PIN_HASH: process.env.APP_PIN_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    HMAC_SECRET: process.env.HMAC_SECRET,
    APP_URL: process.env.APP_URL,
  });

  if (!parsed.success) {
    const keys = Array.from(
      new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "ENV"))),
    );
    throw new EnvConfigurationError(
      `Konfigurasi environment belum lengkap atau tidak valid: ${keys.join(", ")}`,
      keys,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getAppBaseUrl(requestOrigin?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return `https://${vercelProd.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}
