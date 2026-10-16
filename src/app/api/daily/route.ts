import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nacht-Cron (04:00 UTC): Import Hamburg/Remote, danach Aufräumen.
 *
 * Bewertet wird NICHT hier, sondern im Morgen-Cron /api/notify. Vorher liefen
 * drei Importe plus Bewertung in diesem einen 60-Sekunden-Aufruf; die
 * Bewertung kam als vorletzter Schritt praktisch nie dran, und ohne
 * Bewertung erscheint nichts in der Inbox.
 *
 * Bleibt der Import unfertig, ist das unkritisch: Er sucht ein 7-Tage-Fenster
 * und holt beim nächsten Lauf nach, was fehlt.
 */

const SCHRITTE: Array<{ name: string; pfad: string; budget: number }> = [
  { name: "Import Hamburg/Remote", pfad: "/api/import-de", budget: 32_000 },
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
    if (Date.now() - startedAt > 52_000) {
      ergebnisse.push({ schritt: schritt.name, uebersprungen: "Zeit aufgebraucht" });
      continue;
    }

    const trenner = schritt.pfad.includes("?") ? "&" : "?";
    const ziel =
      `${basis}${schritt.pfad}${trenner}budget=${schritt.budget}` +
      (secret ? `&secret=${encodeURIComponent(secret)}` : "");

    try {
      const res = await fetch(ziel, { cache: "no-store" });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // z. B. Vercel-Fehlerseite bei Timeout oder Deployment-Schutz
        body = { error: `keine JSON-Antwort (HTTP ${res.status}): ${text.slice(0, 120)}` };
      }
      ergebnisse.push({
        schritt: schritt.name,
        status: res.status,
        done: body.done ?? null,
        kennzahlen: {
          gespeichert: body.gespeichert ?? null,
          offen: body.offen ?? null,
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
