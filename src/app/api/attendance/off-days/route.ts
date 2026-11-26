import {
  handleRouteError,
  jsonError,
  jsonOk,
  parseJsonBody,
  requireAuthenticatedSession,
} from "@/lib/api-helpers";
import { addOffDays, getUpcomingOffDays, removeOffDay } from "@/lib/store";
import { getTodayWibDate, isValidYmdDate } from "@/lib/timezone";
import { addOffDaysSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const parsed = await parseJsonBody(request, addOffDaysSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const todayWib = getTodayWibDate();
    const pastDate = parsed.data.dates.find((date) => date < todayWib);
    if (pastDate) {
      return jsonError(
        `Tanggal libur (${pastDate}) tidak boleh lebih awal dari hari ini (${todayWib} WIB).`,
        "PAST_DATE_NOT_ALLOWED",
        400,
      );
    }

    const uniqueDates = Array.from(new Set(parsed.data.dates));
    const added = await addOffDays(
      uniqueDates.map((date) => ({
        date,
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      })),
    );

    const upcomingOffDays = await getUpcomingOffDays(todayWib);
    const todayEntry = upcomingOffDays.find((item) => item.date === todayWib);
    const todayOffDay = todayEntry
      ? { isOff: true, ...(todayEntry.note ? { note: todayEntry.note } : {}) }
      : { isOff: false };

    return jsonOk(
      added.length === 1
        ? `Tanggal libur ${added[0]?.date} berhasil ditambahkan.`
        : `${added.length} tanggal libur berhasil ditambahkan.`,
      {
        added,
        upcomingOffDays,
        todayOffDay,
      },
    );
  } catch (error) {
    return handleRouteError(error, "Gagal menambahkan tanggal libur.");
  }
}

export async function DELETE(request: Request) {
  try {
    const authFailure = await requireAuthenticatedSession();
    if (authFailure) {
      return authFailure;
    }

    const dateParam = new URL(request.url).searchParams.get("date")?.trim() ?? "";
    if (!isValidYmdDate(dateParam)) {
      return jsonError(
        "Parameter query ?date=YYYY-MM-DD wajib diisi dengan format tanggal valid.",
        "INVALID_DATE",
        400,
      );
    }

    const removed = await removeOffDay(dateParam);
    const todayWib = getTodayWibDate();
    const upcomingOffDays = await getUpcomingOffDays(todayWib);
    const todayEntry = upcomingOffDays.find((item) => item.date === todayWib);
    const todayOffDay = todayEntry
      ? { isOff: true, ...(todayEntry.note ? { note: todayEntry.note } : {}) }
      : { isOff: false };

    return jsonOk(
      removed
        ? `Tanggal libur ${dateParam} berhasil dibatalkan.`
        : `Tanggal ${dateParam} tidak ada dalam daftar libur.`,
      {
        removedDate: dateParam,
        removed,
        upcomingOffDays,
        todayOffDay,
      },
    );
  } catch (error) {
    return handleRouteError(error, "Gagal menghapus tanggal libur.");
  }
}
