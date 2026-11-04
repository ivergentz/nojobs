import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SUCHBEGRIFFE } from "../../src/lib/normalize-de";
import type { BenchProfil } from "./typen";

/**
 * Suchprofile lesen — nur SELECT, nie schreiben. Ausgegeben werden nur Pseudonyme (P1, P2 …),
 * Suchbegriffe, Ort, Umkreis, Arbeitsort und Nogos. Kein Name, keine E-Mail, kein Profiltext, kein Lebenslauf.
 *
 * Dein Profil (admin) hat keine Suchbegriffe in der Datenbank — seine Suche steht im Code
 * (SUCHBEGRIFFE in src/lib/normalize-de.ts, Hamburg + remote). Die werden hier unverändert übernommen.
 */

const UMKREISE = [10, 25, 50, 100, 200];

type Zeile = { slug: string; rolle: string | null; aktiv: boolean | null; suchbegriffe: string[] | null; einstellungen: Record<string, any> | null };

export function zuBenchProfil(z: Zeile, id: string, herkunft: BenchProfil["herkunft"]): BenchProfil {
  const e = (z.einstellungen && typeof z.einstellungen === "object" ? z.einstellungen : {}) as Record<string, any>;
  const f = (e.fragebogen && typeof e.fragebogen === "object" ? e.fragebogen : {}) as Record<string, any>;
  const admin = z.rolle === "admin";
  const km = Number(e.umkreis);
  return {
    id,
    rolle: admin ? "admin" : "nutzer",
    suchbegriffe: admin ? [...SUCHBEGRIFFE] : (z.suchbegriffe ?? []).filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim()),
    ort: admin ? "Hamburg" : typeof e.ort === "string" && e.ort.trim() ? e.ort.trim() : null,
    umkreis: admin ? 25 : UMKREISE.includes(km) ? km : 25,
    arbeitsort: admin ? ["vor-ort", "hybrid", "remote"] : Array.isArray(f.arbeitsort) ? f.arbeitsort.filter((a: unknown) => a === "vor-ort" || a === "hybrid" || a === "remote") : [],
    nogos: Array.isArray(f.nogos) ? f.nogos.filter((n: unknown) => typeof n === "string") : [],
    herkunft,
  };
}

/** Admin zuerst (P1), dann weitere aktive, nicht gelöschte Profile in Anlagereihenfolge. */
export function ordne(zeilen: Zeile[], herkunft: BenchProfil["herkunft"]): BenchProfil[] {
  const nutzbar = zeilen.filter((z) => z.aktiv !== false && !(z.einstellungen && (z.einstellungen as any).geloescht_at));
  const sortiert = [...nutzbar.filter((z) => z.rolle === "admin"), ...nutzbar.filter((z) => z.rolle !== "admin")];
  return sortiert.map((z, i) => zuBenchProfil(z, `P${i + 1}`, herkunft)).filter((p) => p.suchbegriffe.length > 0);
}

export async function profileAusDatenbank(): Promise<BenchProfil[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-Zugang fehlt (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("profiles").select("slug,rolle,aktiv,suchbegriffe,einstellungen").order("created_at", { ascending: true });
  if (error) throw new Error(`Profile lesen: ${error.message}`);
  return ordne((data ?? []) as Zeile[], "datenbank");
}

/** Pseudonymisierte Datei: [{ rolle, suchbegriffe, einstellungen: { ort, umkreis, fragebogen? } }] */
export function profileAusDatei(pfad: string, herkunft: BenchProfil["herkunft"] = "datei"): BenchProfil[] {
  const roh = JSON.parse(readFileSync(pfad, "utf8")) as Array<Partial<Zeile>>;
  return ordne(roh.map((z, i) => ({ slug: `p${i + 1}`, rolle: z.rolle ?? "nutzer", aktiv: z.aktiv ?? true, suchbegriffe: z.suchbegriffe ?? [], einstellungen: z.einstellungen ?? {} })), herkunft);
}

/** Durchschnittliche Kosten einer Stellenbewertung der letzten 30 Tage (read-only). */
export async function bewertungskosten(): Promise<{ usdProBewertung: number; anzahl: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const seit = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data, error } = await db.from("api_kosten").select("kosten_usd").eq("zweck", "bewertung").eq("ok", true).gte("created_at", seit).limit(5000);
    if (error || !data?.length) return null;
    const werte = data.map((r) => Number(r.kosten_usd)).filter((v) => Number.isFinite(v) && v > 0);
    if (!werte.length) return null;
    return { usdProBewertung: werte.reduce((a, b) => a + b, 0) / werte.length, anzahl: werte.length };
  } catch {
    return null;
  }
}

/** Höchstens n Suchbegriffe, gleichmäßig über die Liste verteilt (deckt verschiedene Berufsgruppen ab). */
export function waehleBegriffe(begriffe: string[], n: number): string[] {
  if (n <= 0) return [];
  if (begriffe.length <= n) return [...begriffe];
  return Array.from({ length: n }, (_, i) => begriffe[Math.floor((i * begriffe.length) / n)]);
}
