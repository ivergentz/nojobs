/**
 * Zugriffsschutz für die Hintergrund-Endpunkte (Import, Bewertung,
 * Benachrichtigung, Aufräumen).
 *
 * DER FEHLER, der die Automatisierung lahmgelegt hat: Geprüft wurde auf den
 * Header "x-vercel-cron". Den schickt Vercel nicht. Jeder Cron-Aufruf lief
 * deshalb in ein 401 "nicht autorisiert" — still, ohne Telegram, ohne Import.
 *
 * Laut Vercel-Doku authentifiziert sich ein Cron so: Ist die Umgebungsvariable
 * CRON_SECRET gesetzt, schickt Vercel "Authorization: Bearer <CRON_SECRET>".
 * Zusätzlich kommt der Header "x-vercel-cron-schedule" mit.
 *
 * Erlaubt ist:
 *   - Authorization: Bearer <CRON_SECRET>       (Vercel-Cron, empfohlen)
 *   - Authorization: Bearer <IMPORT_SECRET>
 *   - ?secret=<IMPORT_SECRET>                   (Steuerungsseite, Browser)
 *   - Header x-vercel-cron-schedule, aber NUR solange kein CRON_SECRET gesetzt
 *     ist — Notlösung, damit die Crons auch ohne neue Variable laufen.
 */
export function authorized(request: Request): boolean {
  const url = new URL(request.url);
  const importSecret = process.env.IMPORT_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");

  if (!importSecret && !cronSecret) return true;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  if (importSecret && header === `Bearer ${importSecret}`) return true;
  if (importSecret && url.searchParams.get("secret") === importSecret) return true;
  if (!cronSecret && request.headers.get("x-vercel-cron-schedule") !== null) return true;

  return false;
}

/** Wurde dieser Aufruf von einem Vercel-Cron ausgelöst? */
export function fromCron(request: Request): boolean {
  return request.headers.get("x-vercel-cron-schedule") !== null;
}
