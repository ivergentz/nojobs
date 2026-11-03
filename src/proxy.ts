import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "./lib/auth";
import { PROFIL_COOKIE } from "./lib/aktuelles-profil";
import { erlaubtFuerNutzer, loginAktiv, oeffentlich, sitzungAusHeader } from "./lib/sitzung";

/**
 * Schritt 2.3 · Login vor jeder Seite und jeder API.
 *
 *   - Hintergrund-Aufrufe (Vercel-Cron, Nachtlauf, Steuerung) kommen wie bisher mit ihrem Secret durch.
 *   - Öffentlich bleiben: Anmeldung und die Besuchsmeldungen deiner Bewerbungslinks (/api/visit).
 *   - Ohne Sitzung: Seiten → /login, APIs → 401.
 *   - Admin (du): alles wie bisher, Profilauswahl oben inklusive.
 *   - Weitere Personen: nur ihre Seiten; das Profil kommt fest aus der Sitzung, nie aus dem Cookie.
 *
 * Notschalter: LOGIN=aus → dieser Proxy lässt alles durch (Stand vor 2.3).
 */
export function proxy(request: NextRequest) {
  if (!loginAktiv()) return NextResponse.next();
  const pfad = request.nextUrl.pathname;
  const istApi = pfad.startsWith("/api/");

  if (oeffentlich(pfad)) return NextResponse.next();
  // Cron, Nachtlauf und Steuerung: Secret wie bisher (Prüfung unverändert in den Routen).
  if (istApi && hatSecret(request)) return NextResponse.next();

  const sitzung = sitzungAusHeader(request.headers.get("cookie"));
  if (!sitzung) {
    if (istApi) return NextResponse.json({ error: "Bitte anmelden." }, { status: 401 });
    const ziel = new URL("/login", request.url);
    if (pfad !== "/") ziel.searchParams.set("weiter", pfad + request.nextUrl.search);
    return NextResponse.redirect(ziel);
  }

  if (sitzung.r === "admin") return NextResponse.next();

  // Weitere Person
  if (!erlaubtFuerNutzer(pfad)) {
    if (istApi) return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
    return NextResponse.redirect(new URL("/inbox", request.url));
  }
  // Profil fest aus der Sitzung: eine fremde Profil-Auswahl im Cookie wird überschrieben.
  const headers = new Headers(request.headers);
  const andere = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith(`${PROFIL_COOKIE}=`));
  headers.set("cookie", [...andere, `${PROFIL_COOKIE}=${sitzung.s}`].join("; "));
  return NextResponse.next({ request: { headers } });
}

/**
 * Hintergrund-Aufruf mit passendem Secret? Gleiche Regel wie in den Routen (lib/auth.ts).
 * Sind in Vercel gar keine Secrets gesetzt, lässt auth.ts schon heute alles durch —
 * dann bleibt das so, damit der Nachtlauf nie am Login scheitert.
 */
function hatSecret(request: NextRequest): boolean {
  return authorized(request);
}

export const config = {
  // Alles außer Next-Dateien und statischen Dateien mit Endung (Bilder, PDFs, Schriften …)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
