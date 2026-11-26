import { jsonOk } from "@/lib/api-helpers";
import { getSessionCookieOptions } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = jsonOk("Berhasil keluar dari dashboard.");
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return response;
}
