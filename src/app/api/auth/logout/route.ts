import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
