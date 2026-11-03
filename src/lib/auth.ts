import { timingSafeEqual } from "node:crypto";

/**
 * Zugriffsschutz für die Hintergrund-Endpunkte (Import, Bewertung,
 * Benachrichtigung, Aufräumen, Steuerung).
 *
 * Laut Vercel-Doku authentifiziert sich ein Cron so: Ist die Umgebungsvariable
 * CRON_SECRET gesetzt, schickt Vercel "Authorization: Bearer <CRON_SECRET>".
 *
 * Erlaubt ist NUR ein nachweisbares Secret:
 *   - Authorization: Bearer <CRON_SECRET>       (Vercel-Cron)
 *   - Authorization: Bearer <IMPORT_SECRET>     (Nachtlauf-Kette, Steuerung)
 *   - ?secret=<IMPORT_SECRET>                   (Steuerungsseite, Browser)
 *
 * Sicherheits-Härtung (Pilot): „Fail closed“.
 *   - Ist kein Secret gesetzt, wird NICHTS mehr freigegeben (vorher: alles offen).
 *   - Der Header x-vercel-cron-schedule allein reicht nie (vorher: ohne CRON_SECRET ja) —
 *     ihn kann jeder mitschicken.
 *   - Leere Secrets zählen als nicht gesetzt; Vergleich in konstanter Zeit.
 */

let gewarnt = false;

function gleich(eingabe: string | null | undefined, soll: string): boolean {
  if (typeof eingabe !== "string" || !soll) return false;
  const a = Buffer.from(eingabe);
  const b = Buffer.from(soll);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorized(request: Request): boolean {
  const importSecret = (process.env.IMPORT_SECRET ?? "").trim();
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!importSecret && !cronSecret) {
    if (!gewarnt) {
      gewarnt = true;
      console.error("[auth] Weder IMPORT_SECRET noch CRON_SECRET gesetzt — Hintergrund-Endpunkte bleiben gesperrt.");
    }
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && (gleich(token, cronSecret) || gleich(token, importSecret))) return true;

  let query: string | null = null;
  try {
    query = new URL(request.url).searchParams.get("secret");
  } catch {
    query = null;
  }
  if (query && gleich(query, importSecret)) return true;

  if (fromCron(request) && !cronSecret) {
    console.error("[auth] Cron-Aufruf abgewiesen: CRON_SECRET ist nicht gesetzt (Vercel schickt dann kein Token).");
  }
  return false;
}

/** Wurde dieser Aufruf von einem Vercel-Cron ausgelöst? Nur für Protokoll und Anzeige — nie zur Freigabe. */
export function fromCron(request: Request): boolean {
  return request.headers.get("x-vercel-cron-schedule") !== null;
}

/** Secret für interne Aufrufe der Nachtlauf-Kette (als Bearer-Token, nicht in der Adresse). */
export function internesSecret(): string | null {
  return (process.env.IMPORT_SECRET ?? "").trim() || (process.env.CRON_SECRET ?? "").trim() || null;
}
