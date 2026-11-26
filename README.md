# Pengingat Jadwal

Aplikasi web full-stack dan sistem otomasi latar belakang untuk **Pengingat Absen Harian (WIB)** serta **Generator Undangan Itinerary & Acara** yang terintegrasi langsung ke Gmail dan Google Calendar (RFC 5545/5546). Seluruh komponen dibangun untuk berjalan 100% pada paket gratis (Vercel Hobby, Upstash Redis Free Tier, Gmail SMTP App Password, dan GitHub Actions).

## Fitur Utama

1. **Pengingat Absen Harian Otomatis (Senin sampai Minggu, zona waktu `Asia/Jakarta` / WIB):**
   - **09.00 WIB (`morning`):** Mengirim pengingat pagi beserta undangan kalender `.ics` (slot 09.00-09.30 WIB, `VALARM` 15 menit) dan tombol tambah manual Google Calendar ke `PARTNER_EMAIL`.
   - **15.00 WIB (`afternoon`):** Pengecekan sore ke `PARTNER_EMAIL` jika hari ini belum dikonfirmasi (tanpa duplikat `.ics`, hanya tautan konfirmasi).
   - **20.30 WIB (`urgent`):** Jika masih belum dikonfirmasi, mengirim peringatan urgent ke `PARTNER_EMAIL` sekaligus email eskalasi terpisah ke `MY_EMAIL` secara paralel (`Promise.allSettled`).
2. **Konfirmasi Aman Anti-Scanner Email (`/confirm`):**
   - Tautan email memuat parameter `date` dan `token` HMAC-SHA256.
   - Permintaan `GET` pada halaman `/confirm` bersifat read-only (tidak mengubah Redis), sehingga pemindai tautan email otomatis tidak memicu konfirmasi palsu.
   - Konfirmasi baru disimpan saat pengguna menekan tombol **Konfirmasi: Saya Sudah Absen** (`POST /api/attendance/confirm`, TTL 48 jam, idempotent, jendela validasi hari ini dan H-1 WIB).
3. **Dashboard Kontrol Manual (`/`):**
   - Status absen hari ini (`Belum Absen` / `Sudah Absen` + jam WIB), tombol konfirmasi manual, serta **Reset Status Hari Ini** dengan dialog konfirmasi.
   - Lini masa status 3 tahap (`09.00`, `15.00`, `20.30 WIB`: `Terkirim`, `Menunggu`, `Dibatalkan`, atau `Dijeda`).
   - Pengiriman pengingat manual (opsi catatan tambahan, checkbox `.ics`, dan pengaman `forceSend` bila hari ini sudah absen).
   - Sakelar **Mode Jeda Bot (Pause)** beserta catatan jeda opsional dan daftar 15 log aktivitas terakhir.
4. **Generator Undangan Itinerary Date & Acara Teman:**
   - **Mode Date Itinerary:** Penerima terkunci otomatis ke `PARTNER_EMAIL` di sisi server.
   - **Mode Acara / Hangout Teman:** Pemilih kontak tersimpan dengan filter grup dan pilih semua per grup, input chip email manual, modal CRUD **Kelola Kontak** di Redis, maksimal 30 penerima unik dalam satu transaksi SMTP.
   - Mendukung acara tunggal maupun multi-sesi (otomatis salin tanggal dan saran jam berikutnya, pindah urutan naik/turun, dukungan lintas tengah malam `+1 hari`), pilihan alarm (`15`, `30`, `60` menit), pilihan 1 file `.ics` gabungan atau file `.ics` terpisah per sesi, serta pratinjau timeline sebelum dikirim.

## Stack Teknologi

- **Framework:** Next.js App Router, React 19, TypeScript (`strict: true`), Tailwind CSS v4, Zod, Lucide React
- **Storage:** Upstash Redis via `@upstash/redis` (REST API saja)
- **Email & Kalender:** Nodemailer via Gmail SMTP (`smtp.gmail.com`, port `465`, `secure: true`) dengan payload MIME berlapis (`text/plain`, `text/html`, inline `text/calendar; charset="utf-8"; method=REQUEST`, dan lampiran `.ics`)
- **Scheduler:** GitHub Actions Cron Job

---

## Panduan Setup Lengkap

### 1. Siapkan Gmail App Password

Gmail memblokir login SMTP memakai password akun biasa. Buat App Password khusus:

1. Buka [Google Account Security](https://myaccount.google.com/security).
2. Pastikan **2-Step Verification (Verifikasi 2 Langkah)** sudah aktif.
3. Cari menu **App passwords** (atau buka langsung [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
4. Masukkan nama aplikasi, misalnya `Pengingat Jadwal`, lalu klik **Create**.
5. Salin 16 karakter App Password yang muncul ke `GMAIL_APP_PASSWORD` (spasi otomatis dibersihkan di server).

### 2. Siapkan Upstash Redis (Free Tier)

1. Daftar atau masuk di [console.upstash.com](https://console.upstash.com).
2. Klik **Create Database**, pilih region terdekat (misalnya `ap-southeast-1` Singapura) dan paket Free.
3. Pada halaman detail database, buka bagian **REST API** (jangan pakai koneksi TCP `redis://`).
4. Salin nilai `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.

### 3. Generate Secrets Keamanan

Instal dependensi lalu jalankan skrip generator:

```bash
npm install
npm run secrets:generate
```

Anda juga bisa langsung menyertakan PIN sebagai argumen (contoh PIN 6 digit):

```bash
node scripts/generate-secrets.mjs 123456
```

Skrip akan mencetak 4 variabel berikut:
- `APP_PIN_HASH` (hash SHA-256 dari PIN Anda)
- `SESSION_SECRET` (64 karakter hex acak untuk tanda tangan session cookie)
- `CRON_SECRET` (64 karakter hex acak untuk autentikasi GitHub Actions Cron)
- `HMAC_SECRET` (64 karakter hex acak untuk tanda tangan tautan `/confirm`)

### 4. Konfigurasi Environment Lokal

Salin `.env.example` menjadi `.env.local` lalu lengkapi seluruh nilai:

```bash
cp .env.example .env.local
```

Daftar lengkap variabel server:

| Variabel | Keterangan |
|---|---|
| `GMAIL_USER` | Alamat Gmail pengirim |
| `GMAIL_APP_PASSWORD` | App Password 16 karakter Gmail |
| `SENDER_NAME` | Nama tampil pengirim pada email dan properti `ORGANIZER` ICS |
| `PARTNER_EMAIL` | Email penerima pengingat harian dan mode Date Itinerary |
| `PARTNER_NAME` | Nama panggilan penerima utama |
| `MY_EMAIL` | Email Anda untuk menerima notifikasi eskalasi pukul 20.30 WIB |
| `UPSTASH_REDIS_REST_URL` | Endpoint REST Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST Upstash Redis |
| `APP_PIN_HASH` | Hash SHA-256 hex (64 karakter) dari PIN dashboard |
| `SESSION_SECRET` | Secret minimal 32 karakter untuk session cookie |
| `CRON_SECRET` | Secret minimal 32 karakter untuk header `Bearer` cron |
| `HMAC_SECRET` | Secret minimal 32 karakter untuk token konfirmasi absen |
| `APP_URL` | URL publik aplikasi (contoh `https://proyek-anda.vercel.app`) |

Jalankan secara lokal:

```bash
npm run dev
```

Buka `http://localhost:3000`. Anda akan diarahkan ke `/login` untuk memasukkan PIN.

### 5. Deploy ke Vercel Hobby

1. Push repositori ini ke GitHub.
2. Buka [vercel.com](https://vercel.com), klik **Add New Project**, lalu impor repositori GitHub tersebut.
3. Pada menu **Settings > Environment Variables**, tambahkan seluruh 13 variabel di atas (pastikan `APP_URL` diisi domain produksi Vercel Anda, tanpa garis miring di akhir).
4. Klik **Deploy**.

### 6. Konfigurasi GitHub Actions Secrets

Agar cron otomatis `09.00`, `15.00`, dan `20.30 WIB` berjalan:

1. Buka repositori GitHub Anda, lalu masuk ke **Settings > Secrets and variables > Actions**.
2. Tambahkan 2 **Repository Secrets**:
   - `APP_URL`: URL produksi Vercel Anda (contoh: `https://pengingat-jadwal.vercel.app`)
   - `CRON_SECRET`: nilai yang persis sama dengan `CRON_SECRET` di Vercel Environment Variables.
3. Buka tab **Actions** dan pastikan workflow `Daily Attendance Reminder Cron` serta `Keep GitHub Actions Active` dalam keadaan aktif.

---

## Langkah Verifikasi & Pengujian

### A. Verifikasi Lokal (TypeScript, Timezone WIB -> UTC, RFC 5545 ICS, Production Build)

```bash
npx tsc --noEmit
npm run verify:ics
npm run build
```

### B. Pengujian End-to-End Setelah Deploy

1. **Uji Login & Rate Limit:**
   - Buka `${APP_URL}`: pastikan langsung dialihkan ke `/login`.
   - Masukkan PIN yang benar: pastikan masuk ke dashboard 2 tab.
2. **Uji Cron Tahap Pagi (`morning`) via GitHub Actions:**
   - Buka tab **Actions > Daily Attendance Reminder Cron > Run workflow**.
   - Pilih `stage: morning` lalu jalankan.
   - Pastikan langkah `Call attendance cron endpoint` selesai dengan HTTP 200.
   - Cek inbox `PARTNER_EMAIL`: email memuat kartu undangan kalender inline + lampiran `.ics` + tombol **Konfirmasi: Saya Sudah Absen** + tombol **Tambah Manual ke Google Calendar**.
   - **Catatan penerima pertama kali:** jika jadwal belum otomatis muncul di Google Calendar, klik tombol **"I know the sender"** (Saya mengenal pengirim) di bagian atas email Gmail.
3. **Uji Idempotency Lock:**
   - Jalankan lagi `stage: morning` pada hari yang sama. Respons harus `skipped: true` dengan alasan `already_sent` dan tidak mengirim email ganda.
4. **Uji Konfirmasi Anti-Scanner (`/confirm`):**
   - Buka tautan konfirmasi dari email: pastikan hanya membuka halaman konfirmasi tanpa langsung mengubah status di dashboard.
   - Tekan tombol **Konfirmasi: Saya Sudah Absen**: status langsung berubah menjadi terkonfirmasi.
   - Uji `stage: afternoon` setelah konfirmasi: respons harus `skipped: true` dengan alasan `already_confirmed`.
5. **Uji Eskalasi 20.30 WIB (`urgent`):**
   - Reset status hari ini di dashboard (centang reset penanda terkirim bila perlu), lalu jalankan `stage: urgent` via `workflow_dispatch` atau `curl`:
   ```bash
   curl --fail-with-body -X POST "${APP_URL}/api/cron/attendance" \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"stage":"urgent"}'
   ```
   - Pastikan `PARTNER_EMAIL` menerima peringatan urgent dan `MY_EMAIL` menerima email eskalasi secara bersamaan.
6. **Uji Generator Itinerary Multi-Sesi & Lintas Tengah Malam:**
   - Buka tab **Undangan & Itinerary**, coba mode **Date Itinerary** dan mode **Acara / Hangout Teman**.
   - Buat 2 sesi (misalnya Sesi 1 `20:00-22:30`, Sesi 2 `22:30-01:00` yang otomatis terdeteksi `+1 hari`), lalu kirim dengan mode 1 file `.ics` gabungan maupun file terpisah per sesi dan pastikan Google Calendar membaca jam WIB secara akurat.
