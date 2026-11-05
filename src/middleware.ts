import { NextResponse, type NextRequest } from "next/server";

/**
 * Resolución del QR: la misma URL /p/{id} devuelve HTML a un navegador y el documento JSON
 * a un cliente que pida application/json.
 */
export function middleware(req: NextRequest) {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    const url = req.nextUrl.clone();
    url.pathname = `/api${url.pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/p/:path*"] };
