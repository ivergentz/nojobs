/**
 * Schritt 2.2 · Welches Profil ist gerade gewählt?
 *
 * Gespeichert im Cookie "ci-profil" (Profil-Auswahl oben in der Navigation).
 * Kein Cookie, leerer oder ungültiger Wert → dein Profil "iver" — die App
 * verhält sich dann exakt wie vor Schritt 2.2. Login und Rechte kommen in 2.3.
 */

import { STANDARD_SLUG } from "./profil";

export const PROFIL_COOKIE = "ci-profil";

export function gueltigerSlug(wert: string | null | undefined): string {
  const s = (wert ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(s) ? s : STANDARD_SLUG;
}

export function istStandard(slug: string | null | undefined): boolean {
  return !slug || slug === STANDARD_SLUG;
}

/** Aus dem Cookie-Header einer Anfrage (API-Routen). */
export function profilAusRequest(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  const treffer = header.split(";").map((t) => t.trim()).find((t) => t.startsWith(`${PROFIL_COOKIE}=`));
  return gueltigerSlug(treffer ? decodeURIComponent(treffer.slice(PROFIL_COOKIE.length + 1)) : null);
}

/** In Server-Komponenten (Seiten). */
export async function profilAusCookies(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    return gueltigerSlug(c.get(PROFIL_COOKIE)?.value);
  } catch {
    return STANDARD_SLUG;
  }
}

/** Unterlagen, PDFs und Vorbereitung gibt es für weitere Profile erst in Phase 4. */
export const NUR_EIGENES_PROFIL =
  "Unterlagen und Gesprächsvorbereitung gibt es vorerst nur für dein Profil — für weitere Profile folgen sie in Phase 4.";
