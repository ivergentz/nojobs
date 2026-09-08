import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ein Cron für alles.
 *
 * Vercel hat den sechsten Cron stillschweigend verworfen — /api/cleanup lief
 * nie. Statt sechs Einträge zu pflegen, ruft dieser Lauf die Schritte
 * nacheinander als eigene Serverless-Aufrufe auf und gibt jedem ein knappes
 * Zeitbudget. Im Dauerbetrieb sind die Tagesmengen klein; die großen Budgets
 * brauchte nur der Rückstand, und den erledigst du bei Bedarf über /admin.
 *
 * Bleibt ein Schritt unfertig, ist das unkritisch: Jeder Importer speichert
 * seinen Cursor, die Bewertung nimmt beim nächsten Mal, was offen ist.
 */

const SCHRITTE: Array<{ name: string; pfad: string; budget: number }> = [
  { name: "Norwegen", pfad: "/api/import", budget: 11_000 },
  { name: "Schweden", pfad: "/api/import-se", budget: 11_000 },
  { name: "Deutschland", pfad: "/api/import-de", budget: 11_000 },
  // Kein days-Filter: bewertet wird alles ohne Urteil, unabhängig vom
  // Veröffentlichungsdatum. Sonst fallen spät importierte Anzeigen lautlos weg.
  { name: "Bewertung", pfad: "/api/evaluate?scope=all", budget: 14_000 },
  { name: "Aufräumen", pfad: "/api/cleanup", budget: 3_000 },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const basis = process.env.PUBLIC_BASE_URL ?? `https://${request.headers.get("host") ?? ""}`;
  const startedAt = Date.now();
  const ergebnisse: Array<Record<string, unknown>> = [];

  for (const schritt of SCHRITTE) {
    // Genug Luft lassen, damit der letzte Schritt nicht ins Limit läuft.
    if (Date.now() - startedAt > 50_000) {
      ergebnisse.push({ schritt: schritt.name, uebersprungen: "Zeit aufgebraucht" });
      continue;
    }

    const trenner = schritt.pfad.includes("?") ? "&" : "?";
    const ziel =
      `${basis}${schritt.pfad}${trenner}budget=${schritt.budget}` +
      (secret ? `&secret=${encodeURIComponent(secret)}` : "");

    try {
      const res = await fetch(ziel, { cache: "no-store" });
      const body = (await res.json()) as Record<string, unknown>;
      ergebnisse.push({
        schritt: schritt.name,
        status: res.status,
        done: body.done ?? null,
        // Nur die Kennzahlen, die es tatsächlich gibt — je nach Schritt andere.
        kennzahlen: {
          gespeichert: body.gespeichert ?? (body.thisRun as any)?.kept ?? null,
          bewertet: body.evaluated ?? null,
          offen: body.nochOffen ?? null,
          abgelaufen: body.fristAbgelaufen ?? null,
          liegengeblieben: body.liegengeblieben ?? null,
        },
        fehler: body.error ?? null,
      });
    } catch (error) {
      ergebnisse.push({
        schritt: schritt.name,
        fehler: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ergebnisse });
}
