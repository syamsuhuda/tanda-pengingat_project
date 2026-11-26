import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildAttendanceReminderEmail,
  buildEscalationEmail,
  buildItineraryEmail,
} from "../src/lib/email-templates";
import {
  buildAttendanceCalendarSlot,
  buildGoogleCalendarTemplateUrl,
  escapeIcsParamValue,
  escapeIcsText,
  foldIcsLine,
  generateIcsCalendar,
} from "../src/lib/ics";
import { generateItineraryIntroMessage } from "../src/lib/itinerary-copy";
import {
  createSessionCookieValue,
  generateNumericOtp6,
  generateVerificationToken,
  hashOtpHmac,
  hashPin,
  hashPinScrypt,
  hashPurposeToken,
  sanitizeEmailHeaderValue,
  sanitizeSenderDisplayName,
  verifyOtpHmac,
  verifyPin,
  verifyPinScrypt,
  verifyPurposeToken,
  verifySessionCookieValue,
} from "../src/lib/security";
import {
  formatHmTimeWibLabel,
  formatIsoToWibDateTime,
  formatIsoToWibTime,
  getNowWibTimeLabel,
  getTodayWibDate,
  getYesterdayWibDate,
  hmTimeToMinutes,
  isWithinAttendanceConfirmWindow,
  resolveDueAutoStage,
  resolveWibSessionUtcRange,
  shiftYmdDate,
} from "../src/lib/timezone";

function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

function runAllAssertions(): void {
  // 1. Batas tengah malam WIB (UTC+7)
  const beforeWibMidnight = new Date("2026-11-26T16:59:59.000Z"); // 2026-11-26 23:59:59 WIB
  const atWibMidnight = new Date("2026-11-26T17:00:00.000Z"); // 2026-11-27 00:00:00 WIB
  assert.equal(getTodayWibDate(beforeWibMidnight), "2026-11-26");
  assert.equal(getTodayWibDate(atWibMidnight), "2026-11-27");
  assert.equal(getYesterdayWibDate(atWibMidnight), "2026-11-26");

  // 2. Pergantian tahun dan tahun kabisat
  assert.equal(shiftYmdDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftYmdDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftYmdDate("2024-03-01", -1), "2024-02-29");

  // 3. Jendela validasi konfirmasi (hari ini & H-1 WIB)
  assert.equal(isWithinAttendanceConfirmWindow("2026-11-27", atWibMidnight), true);
  assert.equal(isWithinAttendanceConfirmWindow("2026-11-26", atWibMidnight), true);
  assert.equal(isWithinAttendanceConfirmWindow("2026-11-25", atWibMidnight), false);
  assert.equal(isWithinAttendanceConfirmWindow("2026-11-28", atWibMidnight), false);
  assert.equal(isWithinAttendanceConfirmWindow("2026-02-30", atWibMidnight), false);

  // 4. Konversi deterministik WIB -> UTC (normal, mundur tanggal UTC, kabisat, lintas tengah malam)
  const morningSlot = resolveWibSessionUtcRange("2026-11-26", "09:00", "09:30");
  assert.equal(morningSlot.dtStartUtc, "20261126T020000Z");
  assert.equal(morningSlot.dtEndUtc, "20261126T023000Z");
  assert.equal(morningSlot.crossesMidnight, false);
  assert.equal(morningSlot.durationMinutes, 30);

  const earlyMorningLeap = resolveWibSessionUtcRange("2024-03-01", "01:00", "02:15");
  assert.equal(earlyMorningLeap.dtStartUtc, "20240229T180000Z");
  assert.equal(earlyMorningLeap.dtEndUtc, "20240229T191500Z");
  assert.equal(earlyMorningLeap.durationMinutes, 75);

  const nyeCrossMidnight = resolveWibSessionUtcRange("2026-12-31", "22:00", "01:30");
  assert.equal(nyeCrossMidnight.crossesMidnight, true);
  assert.equal(nyeCrossMidnight.endDateWib, "2027-01-01");
  assert.equal(nyeCrossMidnight.dtStartUtc, "20261231T150000Z");
  assert.equal(nyeCrossMidnight.dtEndUtc, "20261231T183000Z");
  assert.equal(nyeCrossMidnight.durationMinutes, 210);

  const nyeCrossUtcYear = resolveWibSessionUtcRange("2026-12-31", "23:00", "08:30");
  assert.equal(nyeCrossUtcYear.crossesMidnight, true);
  assert.equal(nyeCrossUtcYear.dtStartUtc, "20261231T160000Z");
  assert.equal(nyeCrossUtcYear.dtEndUtc, "20270101T013000Z");

  // 5. Escaping karakter khusus RFC 5545
  assert.equal(
    escapeIcsText("Jalan Sudirman, Kav. 10; Blok A\\B\nLantai 3"),
    "Jalan Sudirman\\, Kav. 10\\; Blok A\\\\B\\nLantai 3",
  );

  // 6. Folding <= 75 octet UTF-8 tanpa memotong karakter multi-byte
  const longMultiByte = `DESCRIPTION:${"Catatan panjang jadwal makan malam bersama, lokasi di café & pâtisserie • ".repeat(4)}`;
  const folded = foldIcsLine(longMultiByte);
  for (const segment of folded.split("\r\n")) {
    assert.ok(
      Buffer.byteLength(segment, "utf8") <= 75,
      `Baris melebihi 75 octet: ${Buffer.byteLength(segment, "utf8")}`,
    );
  }
  assert.equal(unfoldIcs(folded), longMultiByte);

  // 7. Validasi lengkap dokumen VCALENDAR multi-sesi RFC 5545/5546
  const fixedStamp = new Date("2026-11-26T02:00:00.000Z");
  const ics = generateIcsCalendar([
    {
      uidSeed: "test-event-1",
      summary: "Makan Malam, Kopi; & Ngobrol",
      date: "2026-12-31",
      startTime: "20:00",
      endTime: "22:30",
      locationName: "Kopi Nalar, Senopati",
      mapsUrl: "https://maps.google.com/?q=Kopi+Nalar+Senopati+Jakarta+Selatan+Indonesia",
      description: "Datang santai saja.\nParkir tersedia di belakang gedung; cek jalur alternatif.",
      organizer: { name: "Pengingat Jadwal", email: "sender@gmail.com" },
      attendees: [
        { name: "Dina", email: "dina@example.com" },
        { email: "budi@example.com" },
      ],
      alarmMinutes: 30,
      dtStamp: fixedStamp,
    },
    {
      uidSeed: "test-event-2",
      summary: "Hitung Mundur Tahun Baru",
      date: "2026-12-31",
      startTime: "22:30",
      endTime: "01:00",
      locationName: "Rooftop SCBD",
      organizer: { name: "Pengingat Jadwal", email: "sender@gmail.com" },
      attendees: [{ name: "Dina", email: "dina@example.com" }],
      alarmMinutes: 15,
      dtStamp: fixedStamp,
    },
  ]);

  // Tidak boleh ada LF tunggal tanpa CR
  const withoutCrlf = ics.replace(/\r\n/g, "");
  assert.equal(withoutCrlf.includes("\n"), false, "Ditemukan LF tanpa CR");
  assert.equal(withoutCrlf.includes("\r"), false, "Ditemukan CR tanpa LF");
  assert.equal(ics.endsWith("\r\n"), true, "File ICS harus diakhiri CRLF");

  // Setiap baris fisik maksimal 75 octet UTF-8
  const rawSegments = ics.slice(0, -2).split("\r\n");
  for (const segment of rawSegments) {
    const octets = Buffer.byteLength(segment, "utf8");
    assert.ok(octets <= 75, `Segment ICS melebihi 75 octet (${octets}): ${segment}`);
  }

  // Properti wajib pada hasil unfold
  const unfolded = unfoldIcs(ics);
  const requiredTokens = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "X-WR-TIMEZONE:Asia/Jakarta",
    "DTSTAMP:20261126T020000Z",
    "DTSTART:20261231T130000Z",
    "DTEND:20261231T153000Z",
    "DTSTART:20261231T153000Z",
    "DTEND:20261231T180000Z",
    "SUMMARY:Makan Malam\\, Kopi\\; & Ngobrol",
    'ORGANIZER;CN="Pengingat Jadwal":mailto:sender@gmail.com',
    'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Dina":mailto:dina@example.com',
    "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:budi@example.com",
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VCALENDAR",
  ];

  for (const token of requiredTokens) {
    assert.ok(unfolded.includes(token), `Token RFC 5545 tidak ditemukan: ${token}`);
  }

  const veventCount = (unfolded.match(/BEGIN:VEVENT/g) ?? []).length;
  assert.equal(veventCount, 2, "Harus terdapat 2 VEVENT dalam file gabungan");

  // 8. Google Calendar Template URL fallback
  const gcalUrl = buildGoogleCalendarTemplateUrl({
    title: "Absen Pagi",
    dtStartUtc: morningSlot.dtStartUtc,
    dtEndUtc: morningSlot.dtEndUtc,
    locationName: "Kantor",
  });
  assert.ok(gcalUrl.startsWith("https://calendar.google.com/calendar/render?"));
  assert.ok(gcalUrl.includes("dates=20261126T020000Z%2F20261126T023000Z"));
  assert.ok(gcalUrl.includes("ctz=Asia%2FJakarta"));

  // 9. Personalisasi nama penerima & proteksi XSS pesan khusus di template email
  const personalizedEmail = buildAttendanceReminderEmail({
    stage: "morning",
    dateWib: "2026-11-26",
    recipientName: "Nadia",
    senderName: "Pengingat Jadwal",
    confirmUrl: "https://example.com/confirm?date=2026-11-26&token=abc",
    customMessage: "Semangat jaga pagi <script>alert(1)</script>\nJangan lupa sarapan!",
  });
  assert.ok(personalizedEmail.html.includes("Pagi, Nadia!"));
  assert.ok(personalizedEmail.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal(personalizedEmail.html.includes("<script>alert(1)</script>"), false);
  assert.ok(personalizedEmail.text.includes("Semangat jaga pagi"));

  const escalationEmail = buildEscalationEmail({
    dateWib: "2026-11-26",
    recipientName: "Nadia",
    recipientEmail: "nadia@example.com",
    senderName: "Pengingat Jadwal",
    dashboardUrl: "https://example.com",
    confirmUrl: "https://example.com/confirm?date=2026-11-26&token=abc",
  });
  assert.ok(escalationEmail.subject.includes("Absen Nadia hari ini belum dikonfirmasi"));
  assert.ok(escalationEmail.html.includes("Absen Nadia hari ini belum dikonfirmasi"));

  // 10. Slot .ics absen pagi dinamis (mengikuti schedule.morning.time + 30 menit, termasuk lintas tengah malam)
  const dynamicMorningSlot = buildAttendanceCalendarSlot("2026-11-26", "08:00", 30);
  assert.equal(dynamicMorningSlot.startTime, "08:00");
  assert.equal(dynamicMorningSlot.endTime, "08:30");
  assert.equal(dynamicMorningSlot.dtStartUtc, "20261126T010000Z");
  assert.equal(dynamicMorningSlot.dtEndUtc, "20261126T013000Z");

  const lateSlotCrossMidnight = buildAttendanceCalendarSlot("2026-12-31", "23:30", 30);
  assert.equal(lateSlotCrossMidnight.endTime, "00:00");
  assert.equal(lateSlotCrossMidnight.dtStartUtc, "20261231T163000Z");
  assert.equal(lateSlotCrossMidnight.dtEndUtc, "20261231T170000Z");

  // 11. Logika Smart Dispatcher auto (jendela 90 menit & prioritas urgent > afternoon > morning)
  const testSchedule = {
    morning: { enabled: true, time: "08:30" },
    afternoon: { enabled: true, time: "15:00" },
    urgent: { enabled: true, time: "15:30" },
  };
  const noSent = { morning: null, afternoon: null, urgent: null };

  assert.equal(resolveDueAutoStage(hmTimeToMinutes("08:29"), testSchedule, noSent), null);
  assert.equal(resolveDueAutoStage(hmTimeToMinutes("08:30"), testSchedule, noSent), "morning");
  assert.equal(resolveDueAutoStage(hmTimeToMinutes("10:00"), testSchedule, noSent), "morning");
  assert.equal(resolveDueAutoStage(hmTimeToMinutes("10:01"), testSchedule, noSent), null);
  assert.equal(resolveDueAutoStage(hmTimeToMinutes("15:30"), testSchedule, noSent), "urgent");
  assert.equal(
    resolveDueAutoStage(hmTimeToMinutes("15:30"), testSchedule, {
      morning: null,
      afternoon: null,
      urgent: "2026-11-26T15:30:00+07:00",
    }),
    "afternoon",
  );
  assert.equal(
    resolveDueAutoStage(
      hmTimeToMinutes("08:30"),
      { ...testSchedule, morning: { enabled: false, time: "08:30" } },
      noSent,
    ),
    null,
  );

  // 12. Sanitasi senderName (anti SMTP Header Injection & .ics ORGANIZER)
  assert.equal(
    sanitizeSenderDisplayName('Budi\r\nBcc: evil@attacker.com "Bot"\x00', "Default"),
    "Budi Bcc: evil@attacker.com 'Bot'",
  );
  assert.equal(sanitizeSenderDisplayName("   \r\n  ", "Fallback Bot"), "Fallback Bot");
  assert.equal(sanitizeSenderDisplayName("A".repeat(80), "Fallback").length, 60);

  const sanitizedOrganizerIcs = unfoldIcs(
    generateIcsCalendar([
      {
        uidSeed: "sanitized-org-1@test",
        summary: "Rapat Tim",
        date: "2026-11-26",
        startTime: "10:00",
        endTime: "11:00",
        organizer: {
          name: 'Tim\r\nEvil "Ops"',
          email: "bot@example.com",
        },
        attendees: [{ email: "guest@example.com", name: "Tamu" }],
        alarmMinutes: 30,
      },
    ]),
  );
  assert.ok(sanitizedOrganizerIcs.includes("ORGANIZER;CN=\"Tim Evil 'Ops'\":mailto:bot@example.com"));
  assert.ok(!sanitizedOrganizerIcs.includes("ORGANIZER;CN=\"Tim\r\n"));

  // 13. Generator pesan pembuka & XSS escape untuk kategori/pesan pembuka/senderName di email itinerary
  const formalEventIntro = generateItineraryIntroMessage({
    mode: "event",
    tone: "formal",
    senderName: "Panitia Acara",
    categoryLabel: "Meeting & Diskusi",
    sessionCount: 2,
  });
  assert.ok(formalEventIntro.includes("Panitia Acara"));
  assert.ok(formalEventIntro.includes("Meeting & Diskusi"));
  assert.ok(formalEventIntro.includes("2 sesi"));

  const xssSessionSlot = resolveWibSessionUtcRange("2026-11-26", "18:00", "19:30");
  const xssItineraryEmail = buildItineraryEmail({
    mode: "event",
    subject: "Gathering <Komunitas>",
    senderName: 'Panitia <img src=x onerror="alert(1)">',
    categoryLabel: "<script>alert('cat')</script>",
    messageTone: "custom",
    customIntroMessage: "Baris 1 <b onmouseover=alert(1)>bold</b>\nBaris 2",
    sessions: [
      {
        title: "Sesi Pembukaan",
        date: "2026-11-26",
        startTime: "18:00",
        endTime: "19:30",
        ...xssSessionSlot,
      },
    ],
    icsMode: "combined",
    alarmMinutes: 30,
  });
  assert.ok(!xssItineraryEmail.html.includes("<script>"));
  assert.ok(!xssItineraryEmail.html.includes("<img src=x"));
  assert.ok(!xssItineraryEmail.html.includes("<b onmouseover"));
  assert.ok(xssItineraryEmail.html.includes("&lt;script&gt;alert(&#39;cat&#39;)&lt;/script&gt;"));
  assert.ok(xssItineraryEmail.html.includes("Baris 1 &lt;b onmouseover=alert(1)&gt;bold&lt;/b&gt;<br />Baris 2"));
  assert.ok(xssItineraryEmail.text.includes("Meeting") === false);
  assert.ok(xssItineraryEmail.text.includes("Baris 1"));

  // 14. Unique batchId menghasilkan UID VEVENT berbeda walau detail acara identik
  const batchA = crypto.randomUUID();
  const batchB = crypto.randomUUID();
  const icsBatchA = unfoldIcs(
    generateIcsCalendar([
      {
        uidSeed: `itinerary:${batchA}:date:Dinner:2026-11-26-19:00-Dinner:stop-1`,
        summary: "Dinner",
        date: "2026-11-26",
        startTime: "19:00",
        endTime: "21:00",
        organizer: { name: "Syamsu", email: "bot@example.com" },
        attendees: [{ email: "nadia@example.com", name: "Nadia" }],
        alarmMinutes: 30,
      },
    ]),
  );
  const icsBatchB = unfoldIcs(
    generateIcsCalendar([
      {
        uidSeed: `itinerary:${batchB}:date:Dinner:2026-11-26-19:00-Dinner:stop-1`,
        summary: "Dinner",
        date: "2026-11-26",
        startTime: "19:00",
        endTime: "21:00",
        organizer: { name: "Syamsu", email: "bot@example.com" },
        attendees: [{ email: "nadia@example.com", name: "Nadia" }],
        alarmMinutes: 30,
      },
    ]),
  );
  const uidLineA = icsBatchA.split("\r\n").find((l) => l.startsWith("UID:"));
  const uidLineB = icsBatchB.split("\r\n").find((l) => l.startsWith("UID:"));
  assert.ok(uidLineA && uidLineB);
  assert.notEqual(uidLineA, uidLineB);

  // 15. Keamanan PIN: scrypt hashing + fallback APP_PIN_HASH + sessionVersion invalidation + OTP HMAC
  process.env.SESSION_SECRET ??= "test-session-secret-minimum-32-chars-ok";
  process.env.HMAC_SECRET ??= "test-hmac-secret-minimum-32-chars-ok";
  process.env.CRON_SECRET ??= "test-cron-secret-minimum-32-chars-ok";
  process.env.SENDER_NAME ??= "Pengingat Jadwal";
  process.env.PARTNER_NAME ??= "Nadia";
  process.env.APP_PIN_HASH ??= hashPin("1234");
  process.env.GMAIL_USER ??= "bot@example.com";
  process.env.GMAIL_APP_PASSWORD ??= "abcd-efgh-ijkl-mnop";
  process.env.MY_EMAIL ??= "owner@example.com";
  process.env.PARTNER_EMAIL ??= "partner@example.com";
  process.env.UPSTASH_REDIS_REST_URL ??= "http://127.0.0.1:8799";
  process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";

  assert.equal(verifyPin("1234"), true);
  assert.equal(verifyPin("9999"), false);

  const scryptStored = hashPinScrypt("654321");
  assert.ok(scryptStored.startsWith("scrypt$"));
  assert.equal(verifyPinScrypt("654321", scryptStored), true);
  assert.equal(verifyPinScrypt("123456", scryptStored), false);

  const cookieV2 = createSessionCookieValue("v2-abc");
  assert.equal(verifySessionCookieValue(cookieV2, "v2-abc").valid, true);
  assert.equal(verifySessionCookieValue(cookieV2, "v3-rotated").valid, false);

  const otp6 = generateNumericOtp6();
  assert.match(otp6, /^\d{6}$/);
  const otpSalt = crypto.randomBytes(16).toString("hex");
  const otpHmac = hashOtpHmac(otp6, otpSalt);
  assert.equal(verifyOtpHmac(otp6, otpSalt, otpHmac), true);
  assert.equal(verifyOtpHmac("000000", otpSalt, otpHmac), otp6 === "000000");

  // Simulasi sanitasi input PIN 6 digit (keyboard, paste, numpad)
  const sanitize6 = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);
  assert.equal(sanitize6("12a34b56789"), "123456");
  assert.equal(sanitize6("1234567").length, 6);

  // 16. Sanitasi header email subject & kontrol ASCII pada parameter ICS
  assert.equal(
    sanitizeEmailHeaderValue("Judul\r\nBcc: evil@attacker.com\x07\x00"),
    "Judul Bcc: evil@attacker.com",
  );
  assert.equal(escapeIcsParamValue('Panitia\x00\x07\r\n"Tim"'), "Panitia 'Tim'");

  // 17. Tiket verifikasi OTP terikat purpose (cross-purpose ditolak)
  const vToken = generateVerificationToken();
  assert.match(vToken, /^[a-f0-9]{64}$/);
  const vSalt = crypto.randomBytes(16).toString("hex");
  const changePinTicketHash = hashPurposeToken("change_pin", vToken, vSalt);
  assert.equal(verifyPurposeToken("change_pin", vToken, vSalt, changePinTicketHash), true);
  assert.equal(verifyPurposeToken("forgot_reset", vToken, vSalt, changePinTicketHash), false);

  // 18. Standar waktu mutlak 24 jam (HH:mm WIB) tanpa AM/PM untuk 00:05, 12:00, 13:45, 23:59
  const timeSamples = [
    { iso: "2026-11-26T17:05:00.000Z", expectedTime: "00:05 WIB", expectedDt: "27 Nov 2026, 00:05 WIB" },
    { iso: "2026-11-27T05:00:00.000Z", expectedTime: "12:00 WIB", expectedDt: "27 Nov 2026, 12:00 WIB" },
    { iso: "2026-11-27T06:45:00.000Z", expectedTime: "13:45 WIB", expectedDt: "27 Nov 2026, 13:45 WIB" },
    { iso: "2026-11-27T16:59:00.000Z", expectedTime: "23:59 WIB", expectedDt: "27 Nov 2026, 23:59 WIB" },
  ];
  for (const sample of timeSamples) {
    const tLabel = formatIsoToWibTime(sample.iso);
    const dtLabel = formatIsoToWibDateTime(sample.iso);
    const nowLabel = getNowWibTimeLabel(new Date(sample.iso));
    assert.equal(tLabel, sample.expectedTime);
    assert.equal(dtLabel, sample.expectedDt);
    assert.equal(nowLabel, sample.expectedTime);
    assert.equal(/\b(am|pm)\b/i.test(`${tLabel} ${dtLabel}`), false);
  }
  assert.equal(formatHmTimeWibLabel("09:00"), "09:00 WIB");

  console.log("SEMUA VERIFIKASI TIMEZONE, 24 JAM WIB, ICS DINAMIS, SANITASI HEADER/SENDER, EMAIL, BATCH UID, & KEAMANAN PIN LULUS (18/18 suite).");
}

runAllAssertions();
