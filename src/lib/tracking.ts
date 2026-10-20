/**
 * Bewerbungs-Tracking: jede Bewerbung bekommt einen persönlichen Link
 * (iverbohnes.de/otto). Die Website meldet Aufrufe an /api/visit.
 *
 * TRACKING_DOMAIN (Vercel-Variable) bestimmt die Domain im Link.
 * Ohne Eintrag: ivergentz.de. Sobald iverbohnes.de läuft, dort eintragen.
 */

import { firmaKern } from "./firma";

type Db = any;

export const TRACKING_DOMAIN = (process.env.TRACKING_DOMAIN || "ivergentz.de")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

/** Pfade der Website — dürfen nie ein Kürzel sein. Gleiche Liste wie src/tracking.js der Website. */
const RESERVIERT = new Set([
  "cv",
  "impressum",
  "datenschutz",
  "en",
  "de",
  "static",
  "images",
  "fonts",
  "documents",
  "api",
]);

export const REF_MUSTER = /^[a-z0-9-]{2,40}$/;

/** "OTTO GmbH & Co KG" → "otto", "Deutsche Bahn AG" → "deutsche-bahn". */
export function refBasis(firma: string | null | undefined): string {
  const kern = firmaKern(firma)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .join("-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  const basis = kern.length >= 2 ? kern : "bewerbung";
  return RESERVIERT.has(basis) ? `${basis}-job` : basis;
}

export function trackingLink(ref: string): { text: string; href: string } {
  const text = `${TRACKING_DOMAIN}/${ref}`;
  return { text, href: `https://${text}` };
}

/**
 * Liefert das Kürzel einer Stelle; vergibt eins, falls noch keins da ist.
 * Zweite Bewerbung bei derselben Firma → "otto-2".
 * Fehlt die Spalte (SQL noch nicht ausgeführt), kommt null zurück.
 */
export async function ensureRef(db: Db, uuid: string): Promise<string | null> {
  const { data: job, error } = await db.from("jobs").select("uuid,ref,employer_name").eq("uuid", uuid).maybeSingle();
  if (error || !job) return null;
  if (job.ref) return job.ref as string;

  const basis = refBasis(job.employer_name as string | null);
  const { data: vergeben } = await db.from("jobs").select("ref").like("ref", `${basis}%`).limit(200);
  const belegt = new Set(((vergeben ?? []) as Array<{ ref: string | null }>).map((r) => r.ref));

  for (let n = 1; n < 50; n++) {
    const kandidat = n === 1 ? basis : `${basis}-${n}`;
    if (belegt.has(kandidat)) continue;
    const { error: schreibFehler } = await db
      .from("jobs")
      .update({ ref: kandidat, ref_at: new Date().toISOString() })
      .eq("uuid", uuid)
      .is("ref", null);
    if (!schreibFehler) {
      // Parallel vergeben? Dann gilt, was jetzt in der Zeile steht.
      const { data: neu } = await db.from("jobs").select("ref").eq("uuid", uuid).maybeSingle();
      return (neu?.ref as string) ?? kandidat;
    }
    // Eindeutigkeit verletzt (jemand war schneller) → nächste Nummer.
    belegt.add(kandidat);
  }
  return null;
}

/** Link-Prüfer, Vorschau-Generatoren, Suchmaschinen. */
const BOT_MUSTER =
  /bot|crawl|spider|slurp|preview|scan|headless|phantom|puppeteer|playwright|lighthouse|python|curl|wget|java\/|go-http|okhttp|axios|node-fetch|proofpoint|mimecast|barracuda|safelinks|linkchecker|facebookexternalhit|whatsapp|skypeuripreview|slackbot/i;

export function istBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_MUSTER.test(userAgent);
}

export function geraet(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android/i.test(ua)) return "Mobil";
  return "Desktop";
}

export type Besuch = {
  sitzung: string;
  ref: string;
  job_uuid: string | null;
  seiten: string[];
  sekunden: number | null;
  geraet: string | null;
  bot: boolean;
  created_at: string;
};

export type BesuchsSumme = { anzahl: number; zuletzt: string | null; erster: string | null; cv: boolean };

/** Echte Besuche (ohne Bots) je Stelle zusammenfassen. */
export function besucheJeStelle(besuche: Besuch[]): Map<string, BesuchsSumme> {
  const map = new Map<string, BesuchsSumme>();
  for (const b of besuche) {
    if (b.bot || !b.job_uuid) continue;
    const s = map.get(b.job_uuid) ?? { anzahl: 0, zuletzt: null, erster: null, cv: false };
    s.anzahl += 1;
    if (!s.zuletzt || b.created_at > s.zuletzt) s.zuletzt = b.created_at;
    if (!s.erster || b.created_at < s.erster) s.erster = b.created_at;
    if (b.seiten?.includes("cv")) s.cv = true;
    map.set(b.job_uuid, s);
  }
  return map;
}

export function dauerText(sekunden: number | null): string | null {
  if (!sekunden || sekunden < 1) return null;
  if (sekunden < 60) return `${sekunden} s`;
  const min = Math.round(sekunden / 60);
  return `${min} min`;
}
