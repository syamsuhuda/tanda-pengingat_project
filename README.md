# Pengingat Jadwal

Aplikasi web full-stack dan sistem otomasi latar belakang untuk **Pengingat Absen Harian (WIB)** serta **Generator Undangan Itinerary & Acara** yang terintegrasi langsung ke Gmail dan Google Calendar (RFC 5545/5546). Seluruh komponen dibangun untuk berjalan 100% pada paket gratis (Vercel Hobby, Upstash Redis Free Tier, Gmail SMTP App Password, dan GitHub Actions atau cron-job.org).

## Fitur Utama

1. **Pengingat Absen Harian Fleksibel & Smart Dispatcher (`Asia/Jakarta` / WIB):**
   - **Jam kirim fleksibel dari dashboard (`bot:config:schedule`):** Default `09:00` (`morning`), `15:00` (`afternoon`), dan `20:30 WIB` (`urgent`), seluruhnya dapat diubah (interval 30 menit) atau dinonaktifkan per tahap dengan validasi urutan kronologis `Pagi < Sore < Urgent`.
   - **Smart Dispatcher (`stage: "auto"`):** Dipicu setiap 30 menit (`0,30 * * * *`), memiliki jendela toleransi 90 menit untuk menahan jitter cron, memprioritaskan `urgent > afternoon > morning`, dan tidak memenuhi log aktivitas saat belum waktunya (`skipped_not_due`).
   - **Pagi (`morning`):** Mengirim pengingat pagi + undangan kalender `.ics` berdurasi 30 menit mengikuti jam pagi aktif (`VALARM` 15 menit) dan tombol tambah manual Google Calendar.
   - **Sore (`afternoon`):** Pengecekan sore jika hari ini belum dikonfirmasi (tanpa duplikat `.ics`, hanya tautan konfirmasi).
   - **Urgent (`urgent`):** Jika masih belum dikonfirmasi, mengirim peringatan urgent ke penerima aktif sekaligus email eskalasi terpisah ke `MY_EMAIL` secara paralel (`Promise.allSettled`).
2. **Penerima Dinamis, Pesan Khusus, & Jadwal Libur Fleksibel (Off-Days):**
   - **Penerima aktif dinamis (`bot:config:recipient`):** Nama dan email pasangan dapat diubah langsung dari dashboard (fallback otomatis ke `PARTNER_NAME`/`PARTNER_EMAIL` di env) dan langsung sinkron ke mode **Date Itinerary**.
   - **Pesan khusus pengingat (`bot:config:custom_message`):** Catatan pribadi yang disisipkan ke email pengingat otomatis, dapat diatur **Hanya untuk hari ini** (otomatis hilang besok) atau **Pakai terus sampai saya ubah**.
   - **Jadwal libur fleksibel / shift off-days (`bot:config:off_days`):** Tombol cepat **Liburkan Hari Ini** / **Liburkan Besok** dan penjadwalan tanggal libur mendatang (otomatis *prune* tanggal lampau di Redis).
3. **Konfirmasi Aman Anti-Scanner Email (`/confirm`):**
   - Tautan email memuat `date` dan `token` HMAC-SHA256 berbasis `attendance-confirm:{date}` (tetap valid walaupun email penerima diganti di tengah hari).
   - Permintaan `GET` pada halaman `/confirm` bersifat read-only (tidak mengubah Redis), sehingga pemindai tautan email otomatis tidak memicu konfirmasi palsu.
   - Konfirmasi baru disimpan saat pengguna menekan tombol **Konfirmasi: Saya Sudah Absen** (`POST /api/attendance/confirm`, TTL 48 jam, idempotent, jendela validasi hari ini dan H-1 WIB).
4. **Generator Undangan Itinerary Date & Acara Teman:**
   - **Mode Date Itinerary:** Penerima otomatis mengikuti penerima aktif terbaru dari server.
   - **Mode Acara / Hangout Teman:** Pemilih kontak tersimpan dengan filter grup dan pilih semua per grup, input chip email manual, modal CRUD **Kelola Kontak** di Redis, maksimal 30 penerima unik dalam satu transaksi SMTP.
   - Mendukung acara tunggal maupun multi-sesi (otomatis salin tanggal dan saran jam berikutnya, pindah urutan naik/turun, dukungan lintas tengah malam `+1 hari`), pilihan alarm (`15`, `30`, `60` menit), pilihan 1 file `.ics` gabungan atau file `.ics` terpisah per sesi, serta pratinjau timeline sebelum dikirim.

## Stack Teknologi

- **Framework:** Next.js App Router, React 19, TypeScript (`strict: true`), Tailwind CSS v4, Zod, Lucide React
- **Storage:** Upstash Redis via `@upstash/redis` (REST API saja)
- **Email & Kalender:** Nodemailer via Gmail SMTP (`smtp.gmail.com`, port `465`, `secure: true`) dengan payload MIME berlapis (`text/plain`, `text/html`, inline `text/calendar; charset="utf-8"; method=REQUEST`, dan lampiran `.ics`)
- **Scheduler:** GitHub Actions Cron Job (`0,30 * * * *`) atau alternatif gratis `cron-job.org`

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
- `CRON_SECRET` (64 karakter hex acak untuk autentikasi endpoint cron)
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
| `PARTNER_EMAIL` | Email penerima bawaan (fallback bila belum diubah dari dashboard) |
| `PARTNER_NAME` | Nama panggilan penerima bawaan |
| `MY_EMAIL` | Email Anda untuk menerima notifikasi eskalasi urgent |
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

1. Push repositori ini ke GitHub (atau deploy langsung via Vercel CLI).
2. Buka [vercel.com](https://vercel.com), klik **Add New Project**, lalu impor proyek ini.
3. Pada menu **Settings > Environment Variables**, tambahkan seluruh 13 variabel di atas (pastikan `APP_URL` diisi domain produksi Vercel Anda, tanpa garis miring di akhir).
4. Klik **Deploy**.

### 6. Konfigurasi Scheduler Otomatis (Pilih Salah Satu)

#### Opsi A: GitHub Actions Cron (Direkomendasikan jika memakai GitHub)
1. Buka repositori GitHub Anda, lalu masuk ke **Settings > Secrets and variables > Actions**.
2. Tambahkan 2 **Repository Secrets**:
   - `APP_URL`: URL produksi Vercel Anda (contoh: `https://pengingat-jadwal.vercel.app`)
   - `CRON_SECRET`: nilai yang persis sama dengan `CRON_SECRET` di Vercel Environment Variables.
3. Buka tab **Actions** dan pastikan workflow `Daily Attendance Reminder Cron` (jadwal `0,30 * * * *`, memanggil `{"stage":"auto"}`) serta `Keep GitHub Actions Active` dalam keadaan aktif.

#### Opsi B: cron-job.org (Alternatif Gratis Tanpa GitHub Actions)
Jika Anda deploy ke Vercel tanpa GitHub atau menginginkan pemicu cron yang lebih presisi setiap 30 menit:

1. Buat akun gratis di [cron-job.org](https://cron-job.org), lalu klik **Create cronjob**.
2. Isi konfigurasi dasar:
   - **Title:** `Pengingat Absen Smart Dispatcher`
   - **URL:** `https://<domain-vercel-anda>/api/cron/attendance`
   - **Execution schedule:** pilih **Custom**, atur **Minutes** ke `0, 30` (setiap 30 menit sepanjang hari), Hours/Days/Months `*`.
3. Buka tab **Advanced**:
   - **Request method:** `POST`
   - **Headers:** tambahkan dua header berikut:
     - `Authorization`: `Bearer <CRON_SECRET_ANDA>`
     - `Content-Type`: `application/json`
   - **Request body:**
     ```json
     {"stage":"auto"}
     ```
4. Klik **Test Run** untuk memastikan server membalas HTTP `200`, lalu klik **Create**.

---

## Langkah Verifikasi & Pengujian

### A. Verifikasi Lokal (TypeScript, Timezone WIB -> UTC, RFC 5545 ICS, Smart Dispatcher, Build)

```bash
npx tsc --noEmit
npm run verify:ics
npm run build
```

### B. Pengujian End-to-End Setelah Deploy

1. **Uji Login & Rate Limit:**
   - Buka `${APP_URL}`: pastikan langsung dialihkan ke `/login`.
   - Masukkan PIN yang benar: pastikan masuk ke dashboard 2 tab.
2. **Uji Smart Dispatcher (`auto`) & Tahap Manual (`morning`/`afternoon`/`urgent`):**
   - Jalankan `POST ${APP_URL}/api/cron/attendance` dengan `{"stage":"auto"}` di luar jendela jam kirim: pastikan respons HTTP `200` dengan `status: "skipped_not_due"` dan tidak menambah entri sampah ke Log Aktivitas.
   - Uji kirim tahap pagi secara langsung lewat GitHub Actions **Run workflow** (`stage: morning`) atau `curl`:
   ```bash
   curl --fail-with-body -X POST "${APP_URL}/api/cron/attendance" \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"stage":"morning"}'
   ```
   - Cek inbox penerima aktif: email menyapa dengan nama pasangan, menampilkan pesan khusus (jika aktif), memuat kartu undangan kalender `.ics` sesuai jam pagi yang diatur di dashboard + tombol **Konfirmasi: Saya Sudah Absen** + tombol **Tambah Manual ke Google Calendar**.
   - **Catatan penerima pertama kali:** jika jadwal belum otomatis muncul di Google Calendar, klik tombol **"I know the sender"** (Saya mengenal pengirim) di bagian atas email Gmail.
3. **Uji Idempotency Lock & Konfirmasi Anti-Scanner (`/confirm`):**
   - Jalankan lagi `stage: morning` pada hari yang sama: respons harus `status: "skipped_duplicate"` tanpa mengirim email ganda.
   - Buka tautan `/confirm` dari email: pastikan hanya membuka halaman konfirmasi (read-only) tanpa mengubah status.
   - Tekan **Konfirmasi: Saya Sudah Absen**: status berubah menjadi terkonfirmasi, dan pengecekan `stage: afternoon` setelahnya mengembalikan `status: "skipped_confirmed"`.
4. **Uji Jadwal Libur (Off-Days) & Jam Fleksibel:**
   - Klik **Liburkan Hari Ini** di dashboard: Hero Card menampilkan **Hari Ini Libur (Bot Tidak Mengirim)**, lini masa menampilkan status `Libur`, dan pemanggilan cron mengembalikan `status: "skipped_off_day"`.
   - Ubah jam kirim di **Pengaturan Jam Kirim Fleksibel** dan pastikan lini masa langsung memperbarui jam WIB aktual.
5. **Uji Eskalasi Urgent & Generator Itinerary:**
   - Reset status hari ini, batalkan libur, lalu jalankan `stage: urgent` untuk memastikan penerima aktif dan `MY_EMAIL` menerima email paralel.
   - Buka tab **Undangan & Itinerary**, pastikan mode **Date Itinerary** otomatis menampilkan penerima aktif terbaru dari Tab 1, lalu uji kirim single/multi-sesi lintas tengah malam.
