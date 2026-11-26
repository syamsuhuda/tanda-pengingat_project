import { jsonOk } from "@/lib/api-helpers";
import { AUTH_NO_STORE_HEADERS, getSessionCookieOptions } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = jsonOk("Berhasil keluar dari dashboard.");
  for (const [k, v] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(k, v);
  }
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return response;
}
