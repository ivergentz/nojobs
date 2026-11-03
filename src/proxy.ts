import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "./lib/auth";
import { PROFIL_COOKIE } from "./lib/aktuelles-profil";
import { erlaubtFuerNutzer, loginAktiv, oeffentlich, SITZUNG_COOKIE, sitzungAusHeader } from "./lib/sitzung";
import { profilNutzbar } from "./lib/profil-sperre";
import { supabaseAdmin } from "./lib/supabase";
import { STANDARD_SLUG } from "./lib/profil";

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
export async function proxy(request: NextRequest) {
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

  if (sitzung.r === "admin") return adminWeiter(request, pfad, istApi);

  // Weitere Person — deaktiviert oder gelöscht? Dann gilt die alte Anmeldung nicht mehr.
  let nutzbar = true;
  try {
    nutzbar = await profilNutzbar(supabaseAdmin(), sitzung.s);
  } catch {
    /* Datenbank nicht erreichbar: nicht aussperren */
  }
  if (!nutzbar) {
    const antwort = istApi
      ? NextResponse.json({ error: "Dieses Profil ist nicht mehr aktiv." }, { status: 401 })
      : NextResponse.redirect(new URL("/login?fehler=gesperrt", request.url));
    antwort.cookies.delete(SITZUNG_COOKIE);
    return antwort;
  }
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
 * Betreiber-Seiten, die für alle Profile gelten. Ist gerade ein anderes Profil gewählt,
 * schaltet der Aufruf auf dein Profil zurück — sonst stünden fremde und eigene Zahlen gemischt nebeneinander.
 */
const SEITEN_NUR_EIGENES_PROFIL = ["/admin", "/kosten", "/log", "/analytics"];

function adminWeiter(request: NextRequest, pfad: string, istApi: boolean) {
  if (istApi || !SEITEN_NUR_EIGENES_PROFIL.some((p) => pfad === p || pfad.startsWith(`${p}/`))) return NextResponse.next();
  // Nur echte Seitenaufrufe (Adresse eingegeben, Lesezeichen, Neu laden) schalten um. Das Vorab-Laden von Links
  // im Hintergrund würde sonst schon beim bloßen Anzeigen eines Links umschalten (Next entfernt dessen Kennung vor dem Proxy).
  if (!(request.headers.get("accept") ?? "").includes("text/html")) return NextResponse.next();
  const teile = (request.headers.get("cookie") ?? "").split(";").map((t) => t.trim()).filter(Boolean);
  const gewaehlt = teile.find((t) => t.startsWith(`${PROFIL_COOKIE}=`))?.slice(PROFIL_COOKIE.length + 1);
  if (!gewaehlt || decodeURIComponent(gewaehlt) === STANDARD_SLUG) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("cookie", [...teile.filter((t) => !t.startsWith(`${PROFIL_COOKIE}=`)), `${PROFIL_COOKIE}=${STANDARD_SLUG}`].join("; "));
  const antwort = NextResponse.next({ request: { headers } });
  antwort.cookies.set(PROFIL_COOKIE, STANDARD_SLUG, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return antwort;
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
