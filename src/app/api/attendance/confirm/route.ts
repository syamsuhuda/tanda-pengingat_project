import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
  withNoStore,
} from "@/lib/api-helpers";
import { verifyAttendanceToken } from "@/lib/security";
import { appendActivityLog, setAttendanceConfirmed } from "@/lib/store";
import {
  formatWibDateIndonesian,
  getTodayWibDate,
  isWithinAttendanceConfirmWindow,
} from "@/lib/timezone";
import { confirmAttendanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, confirmAttendanceSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const payload = parsed.data;

    if ("manual" in payload) {
      const authFailure = await requireAuthenticatedSession();
      if (authFailure) {
        return authFailure;
      }

      const targetDate = payload.date ?? getTodayWibDate();
      if (!isWithinAttendanceConfirmWindow(targetDate)) {
        return jsonError(
          "Tanggal konfirmasi harus berada pada hari ini atau kemarin (WIB).",
          "DATE_OUT_OF_WINDOW",
          400,
        );
      }

      const { record, alreadyConfirmed } = await setAttendanceConfirmed(
        targetDate,
        "dashboard_manual",
      );

      if (!alreadyConfirmed) {
        await appendActivityLog({
          type: "attendance_confirmed",
          summary: `Absen ${targetDate} dikonfirmasi manual melalui dashboard.`,
          result: "success",
        });
      }

      return withNoStore(
        jsonOk(
          alreadyConfirmed
            ? `Absen untuk ${formatWibDateIndonesian(targetDate)} sudah tercatat sebelumnya.`
            : `Absen untuk ${formatWibDateIndonesian(targetDate)} berhasil dikonfirmasi.`,
          {
            dateWib: targetDate,
            alreadyConfirmed,
            record,
          },
        ),
      );
    }

    const { date, token } = payload;

    if (!isWithinAttendanceConfirmWindow(date)) {
      return jsonError(
        "Tautan konfirmasi sudah kedaluwarsa atau berada di luar jendela tanggal WIB (hari ini / kemarin).",
        "DATE_OUT_OF_WINDOW",
        400,
      );
    }

    if (!verifyAttendanceToken(date, token)) {
      return jsonError(
        "Token konfirmasi tidak valid. Gunakan tautan asli dari email pengingat.",
        "INVALID_TOKEN",
        403,
      );
    }

    const { record, alreadyConfirmed } = await setAttendanceConfirmed(date, "email_link");

    if (!alreadyConfirmed) {
      await appendActivityLog({
        type: "attendance_confirmed",
        summary: `Absen ${date} dikonfirmasi melalui tautan email.`,
        result: "success",
      });
    }

    return withNoStore(
      jsonOk(
        alreadyConfirmed
          ? `Absen untuk ${formatWibDateIndonesian(date)} sudah tercatat sebelumnya.`
          : `Terima kasih! Absen untuk ${formatWibDateIndonesian(date)} berhasil dikonfirmasi.`,
        {
          dateWib: date,
          alreadyConfirmed,
          record,
        },
      ),
    );
  } catch (error) {
    return handleRouteError(error, "Gagal menyimpan konfirmasi absen.");
  }
}
