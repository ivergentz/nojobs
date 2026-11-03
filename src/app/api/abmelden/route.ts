import { NextResponse } from "next/server";
import { PROFIL_COOKIE } from "@/lib/aktuelles-profil";
import { basisUrl, SITZUNG_COOKIE } from "@/lib/sitzung";

export const dynamic = "force-dynamic";

/** Schritt 2.3 · Abmelden auf diesem Gerät. */
function abmelden(request: Request) {
  const basis = basisUrl(request);
  const res = NextResponse.redirect(new URL("/login?abgemeldet=1", basis), 303);
  res.cookies.set(SITZUNG_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(PROFIL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
export const GET = abmelden;
export const POST = abmelden;
