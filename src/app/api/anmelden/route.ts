import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PROFIL_COOKIE } from "@/lib/aktuelles-profil";
import { basisUrl, cookieOptionen, neueSitzung, pruefeToken, sicheresZiel, SITZUNG_COOKIE, SITZUNG_TAGE } from "@/lib/sitzung";

export const dynamic = "force-dynamic";

/** Schritt 2.3 · Klick auf den Link aus der E-Mail → Sitzung für 180 Tage, weiter zur Inbox. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const link = pruefeToken(url.searchParams.get("t"), "link");
  const basis = basisUrl(request);
  if (!link) return NextResponse.redirect(new URL("/login?fehler=abgelaufen", basis));

  if (link.r === "nutzer") {
    // Inzwischen deaktiviert oder gelöscht? Dann keine Anmeldung.
    const { data } = await supabaseAdmin().from("profiles").select("slug,aktiv,rolle").eq("slug", link.s).maybeSingle();
    if (!data || data.aktiv === false || data.rolle === "admin") return NextResponse.redirect(new URL("/login?fehler=gesperrt", basis));
  }

  const res = NextResponse.redirect(new URL(sicheresZiel(url.searchParams.get("weiter")), basis));
  res.cookies.set(SITZUNG_COOKIE, neueSitzung(link.s, link.r), cookieOptionen(SITZUNG_TAGE * 86400));
  // Weitere Personen: Profil-Auswahl passend setzen (wird ohnehin aus der Sitzung erzwungen).
  if (link.r === "nutzer") res.cookies.set(PROFIL_COOKIE, link.s, { path: "/", sameSite: "lax", maxAge: SITZUNG_TAGE * 86400 });
  return res;
}
