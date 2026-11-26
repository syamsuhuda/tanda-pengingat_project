import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function randomSecretHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function resolvePinFromArgsOrPrompt() {
  const argPin = process.argv[2]?.trim();
  if (argPin) {
    return argPin;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question("Masukkan PIN dashboard (tepat 6 digit angka): ")).trim();
    return answer;
  } finally {
    rl.close();
  }
}

async function main() {
  const pin = await resolvePinFromArgsOrPrompt();
  if (!/^\d{6}$/.test(pin)) {
    console.error("Error: PIN harus berupa tepat 6 digit angka (contoh: 246810).");
    process.exit(1);
  }

  const pinHash = sha256Hex(pin);
  const sessionSecret = randomSecretHex(32);
  const cronSecret = randomSecretHex(32);
  const hmacSecret = randomSecretHex(32);

  console.log("\nSalin nilai berikut ke .env.local dan Environment Variables Vercel:\n");
  console.log(`APP_PIN_HASH=${pinHash}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);
  console.log(`CRON_SECRET=${cronSecret}`);
  console.log(`HMAC_SECRET=${hmacSecret}`);
  console.log("\nCatatan: simpan juga CRON_SECRET yang sama ke GitHub Repository Secrets.");
}

main().catch((err) => {
  console.error("Gagal membuat secrets:", err instanceof Error ? err.message : err);
  process.exit(1);
});
