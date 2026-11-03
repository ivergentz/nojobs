/**
 * Schritt 2.3 · Login — Sitzung und Anmelde-Links.
 *
 * Ohne Passwort: Wer sich anmeldet, bekommt einen Link per E-Mail (Brevo).
 * Der Link und danach die Sitzung sind signierte Werte (HMAC) — es gibt keine
 * Sitzungstabelle und keine Abhängigkeit von Supabase Auth.
 *
 *   Admin  = du (ADMIN_EMAIL, Standard iverbohnes@gmail.com) → Profil „iver“, sieht alles,
 *            kann oben jedes Profil wählen.
 *   Nutzer = jedes weitere aktive Profil mit hinterlegter E-Mail → sieht nur sich selbst.
 *
 * Notschalter: LOGIN=aus in Vercel → alles wie vor 2.3, ohne Anmeldung.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SITZUNG_COOKIE = "ci-sitzung";
export const SITZUNG_TAGE = 180;
export const LINK_MINUTEN = 30;

export type Rolle = "admin" | "nutzer";
export type Sitzung = { s: string; r: Rolle; exp: number; typ: "sitzung" | "link" };

export function loginAktiv(): boolean {
  return (process.env.LOGIN ?? "").trim().toLowerCase() !== "aus";
}

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "iverbohnes@gmail.com").trim().toLowerCase();
}

function schluessel(): Buffer | null {
  const basis = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis) return null;
  // Eigener, abgeleiteter Schlüssel — der Supabase-Schlüssel selbst verlässt nie den Server.
  return createHmac("sha256", basis).update("career-inbox · sitzung · v1").digest();
}

export function signiere(daten: Sitzung): string {
  const k = schluessel();
  if (!k) throw new Error("Kein Schlüssel für die Anmeldung (AUTH_SECRET oder SUPABASE_SERVICE_ROLE_KEY fehlt).");
  const body = Buffer.from(JSON.stringify(daten)).toString("base64url");
  const sig = createHmac("sha256", k).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function pruefeToken(token: string | null | undefined, typ: Sitzung["typ"]): Sitzung | null {
  const k = schluessel();
  if (!k || !token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const soll = createHmac("sha256", k).update(body).digest();
  let ist: Buffer;
  try {
    ist = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (ist.length !== soll.length || !timingSafeEqual(ist, soll)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Sitzung;
    if (d.typ !== typ || typeof d.s !== "string" || (d.r !== "admin" && d.r !== "nutzer")) return null;
    if (typeof d.exp !== "number" || d.exp < Date.now()) return null;
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(d.s)) return null;
    return d;
  } catch {
    return null;
  }
}

export function neueSitzung(slug: string, rolle: Rolle): string {
  return signiere({ s: slug, r: rolle, exp: Date.now() + SITZUNG_TAGE * 864e5, typ: "sitzung" });
}

export function neuerLink(slug: string, rolle: Rolle, minuten = LINK_MINUTEN): string {
  return signiere({ s: slug, r: rolle, exp: Date.now() + minuten * 60_000, typ: "link" });
}

/** Wert eines Cookies aus einem Cookie-Header. */
export function cookieWert(header: string | null | undefined, name: string): string | null {
  const treffer = (header ?? "").split(";").map((t) => t.trim()).find((t) => t.startsWith(`${name}=`));
  if (!treffer) return null;
  try {
    return decodeURIComponent(treffer.slice(name.length + 1));
  } catch {
    return null;
  }
}

/** Sitzung aus einer Anfrage (Proxy, API-Routen). Ohne Login-Pflicht immer null. */
export function sitzungAusHeader(cookieHeader: string | null | undefined): Sitzung | null {
  if (!loginAktiv()) return null;
  return pruefeToken(cookieWert(cookieHeader, SITZUNG_COOKIE), "sitzung");
}

/** In Server-Komponenten (Layout, Seiten). */
export async function sitzungAusCookies(): Promise<Sitzung | null> {
  if (!loginAktiv()) return null;
  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    return pruefeToken(c.get(SITZUNG_COOKIE)?.value, "sitzung");
  } catch {
    return null;
  }
}

/** Nur relative Ziele innerhalb der App — kein Weiterleiten auf fremde Seiten. */
export function sicheresZiel(ziel: string | null | undefined): string {
  return typeof ziel === "string" && /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/.test(ziel) && !ziel.startsWith("/api/") && !ziel.startsWith("/login")
    ? ziel
    : "/inbox";
}

export const cookieOptionen = (maxAgeSek: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSek,
});

/* ---------- Rechte ---------- */

/** Seiten, die weitere Personen sehen dürfen. Alles andere (Steuerung, Kosten, Log, Statistik …) nur du. */
export const SEITEN_NUTZER = ["/inbox", "/label", "/eval", "/profil", "/so-funktionierts"];
/** API-Routen, die weitere Personen nutzen dürfen (mit ihrer Sitzung, immer nur für ihr Profil). */
export const API_NUTZER = ["/api/label", "/api/status", "/api/lebenslauf", "/api/suchprofil", "/api/startlauf", "/api/telegram", "/api/abmelden"];
/** Ohne Anmeldung erreichbar. */
export const OEFFENTLICH = ["/login", "/api/login", "/api/anmelden", "/api/abmelden", "/api/visit"];

const passt = (pfad: string, liste: string[]) => liste.some((p) => pfad === p || pfad.startsWith(`${p}/`));

export function oeffentlich(pfad: string): boolean {
  return passt(pfad, OEFFENTLICH);
}

export function erlaubtFuerNutzer(pfad: string): boolean {
  return pfad === "/" || passt(pfad, SEITEN_NUTZER) || passt(pfad, API_NUTZER);
}

/** Adresse der App für Links und Weiterleitungen — so, wie der Browser sie aufgerufen hat. */
export function basisUrl(request: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
