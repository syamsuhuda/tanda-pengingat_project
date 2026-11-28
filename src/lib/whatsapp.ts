export interface WhatsAppGatewayHealth {
  configured: boolean;
  ok: boolean;
  status: "connected" | "disconnected" | "unconfigured" | "error";
  label: string;
  detail: string;
  uptimeSec: number | null;
  connectedAt: string | null;
  memoryMb: number | null;
  lastError: string | null;
}

export interface WhatsAppSendResult {
  ok: boolean;
  to: string;
  messageId?: string;
  error?: string;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("Modul WhatsApp hanya boleh diakses dari sisi server.");
  }
}

function getWhatsAppConfig(): { baseUrl: string; apiKey: string } | null {
  assertServerOnly();
  const rawUrl = process.env.WA_GATEWAY_URL?.trim() ?? "";
  const apiKey = process.env.WA_API_KEY?.trim() ?? "";

  if (!rawUrl || !apiKey) {
    return null;
  }

  const cleanUrl = rawUrl.replace(/\/+$/, "");
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }

  return { baseUrl: cleanUrl, apiKey };
}

function sanitizeGatewayErrorMessage(raw: unknown, fallback: string): string {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : fallback;

  const cleaned = text
    .replace(/https?:\/\/[^\s]+/gi, "[gateway]")
    .replace(/(x-api-key|bearer)\s*[:=]?\s*[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
}

/**
 * Membersihkan nomor telepon dan menormalkan awalan lokal Indonesia (0/8) ke format 628xxx.
 */
export function normalizeIndonesianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith("8")) {
    return `62${digits}`;
  }
  return digits;
}

/**
 * Memvalidasi format nomor WhatsApp Indonesia (diawali 628, panjang total 10-15 digit).
 */
export function isValidIndonesianPhone(normalized: string): boolean {
  return /^628\d{7,12}$/.test(normalized);
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

export async function getWhatsAppGatewayHealth(): Promise<WhatsAppGatewayHealth> {
  const config = getWhatsAppConfig();
  if (!config) {
    return {
      configured: false,
      ok: false,
      status: "unconfigured",
      label: "Belum Dikonfigurasi",
      detail: "Variabel WA_GATEWAY_URL atau WA_API_KEY belum diatur di server.",
      uptimeSec: null,
      connectedAt: null,
      memoryMb: null,
      lastError: null,
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        status: "error",
        label: "Gateway Bermasalah",
        detail: `WhatsApp Gateway merespons HTTP ${response.status}.`,
        uptimeSec: null,
        connectedAt: null,
        memoryMb: null,
        lastError: `HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      ok?: unknown;
      status?: unknown;
      lastError?: unknown;
      uptimeSec?: unknown;
      connectedAt?: unknown;
      memoryMb?: unknown;
    };

    const gatewayStatus = typeof payload.status === "string" ? payload.status : "unknown";
    const isConnected = payload.ok === true && gatewayStatus === "connected";
    const uptimeSec =
      typeof payload.uptimeSec === "number" && Number.isFinite(payload.uptimeSec)
        ? Math.max(0, Math.floor(payload.uptimeSec))
        : null;
    const connectedAt = typeof payload.connectedAt === "string" ? payload.connectedAt : null;
    const memoryMb =
      typeof payload.memoryMb === "number" && Number.isFinite(payload.memoryMb)
        ? Math.round(payload.memoryMb)
        : null;
    const lastError =
      typeof payload.lastError === "string" && payload.lastError.trim()
        ? sanitizeGatewayErrorMessage(payload.lastError, "Gangguan koneksi WhatsApp.")
        : null;

    if (isConnected) {
      return {
        configured: true,
        ok: true,
        status: "connected",
        label: "Terhubung",
        detail:
          uptimeSec !== null
            ? `WhatsApp Gateway aktif dan siap kirim (uptime ${Math.floor(uptimeSec / 60)} mnt).`
            : "WhatsApp Gateway aktif dan siap kirim.",
        uptimeSec,
        connectedAt,
        memoryMb,
        lastError,
      };
    }

    return {
      configured: true,
      ok: false,
      status: "disconnected",
      label: "Terputus",
      detail: lastError
        ? `Bot WhatsApp belum terhubung (${lastError}).`
        : `Status gateway saat ini: ${gatewayStatus}.`,
      uptimeSec,
      connectedAt,
      memoryMb,
      lastError,
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      configured: true,
      ok: false,
      status: "error",
      label: isTimeout ? "Timeout" : "Tidak Terjangkau",
      detail: isTimeout
        ? "Koneksi ke WhatsApp Gateway timeout (> 8 detik)."
        : sanitizeGatewayErrorMessage(error, "Gagal menghubungi WhatsApp Gateway."),
      uptimeSec: null,
      connectedAt: null,
      memoryMb: null,
      lastError: isTimeout ? "Request timeout" : "Network error",
    };
  }
}

export async function sendWhatsAppMessage(
  to: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const normalized = normalizeIndonesianPhone(to);
  if (!isValidIndonesianPhone(normalized)) {
    return {
      ok: false,
      to: normalized || to,
      error: "Format nomor WhatsApp tidak valid. Gunakan awalan 08xxx atau 628xxx (10-15 digit).",
    };
  }

  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return {
      ok: false,
      to: normalized,
      error: "Isi pesan WhatsApp tidak boleh kosong.",
    };
  }

  const config = getWhatsAppConfig();
  if (!config) {
    return {
      ok: false,
      to: normalized,
      error: "WhatsApp Gateway belum dikonfigurasi di server (WA_GATEWAY_URL / WA_API_KEY).",
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        to: normalized,
        message: trimmedMessage,
      }),
      signal: AbortSignal.timeout(12000),
    });

    let bodyData: { ok?: unknown; messageId?: unknown; id?: unknown; error?: unknown; message?: unknown } | null =
      null;
    try {
      bodyData = (await response.json()) as {
        ok?: unknown;
        messageId?: unknown;
        id?: unknown;
        error?: unknown;
        message?: unknown;
      };
    } catch {
      bodyData = null;
    }

    if (!response.ok || bodyData?.ok === false) {
      const serverErr =
        (typeof bodyData?.error === "string" && bodyData.error) ||
        (typeof bodyData?.message === "string" && bodyData.message) ||
        `Gateway mengembalikan status HTTP ${response.status}.`;
      return {
        ok: false,
        to: normalized,
        error: sanitizeGatewayErrorMessage(serverErr, "Gagal mengirim pesan melalui WhatsApp Gateway."),
      };
    }

    const messageId =
      typeof bodyData?.messageId === "string"
        ? bodyData.messageId
        : typeof bodyData?.id === "string"
          ? bodyData.id
          : undefined;

    return {
      ok: true,
      to: normalized,
      ...(messageId ? { messageId } : {}),
    };
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      to: normalized,
      error: isTimeout
        ? "Pengiriman WhatsApp timeout (> 12 detik)."
        : sanitizeGatewayErrorMessage(error, "Koneksi ke WhatsApp Gateway gagal."),
    };
  }
}
