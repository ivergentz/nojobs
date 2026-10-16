import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nacht-Cron (04:00 UTC): Import aus allen Quellen, danach Aufräumen.
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
  { name: "Karriereseiten", pfad: "/api/import-ats", budget: 10_000 },
  { name: "Google Jobs & Arbeitnow", pfad: "/api/import-sammel", budget: 10_000 },
  { name: "Arbeitsagentur", pfad: "/api/import-de", budget: 14_000 },
  { name: "Aufräumen", pfad: "/api/cleanup", budget: 3_000 },
];

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  // Erst prüfen, ob die Datenbank erreichbar ist. Pausiert Supabase das
  // Projekt (Free Plan nach 7 Tagen Inaktivität), scheitert alles Weitere —
  // und das Log kann es nicht einmal festhalten. Dann per Telegram melden.
  try {
    const { error } = await supabaseAdmin().from("import_cursor").select("id").limit(1);
    if (error) throw new Error(error.message);
  } catch (error) {
    const meldung = error instanceof Error ? error.message : String(error);
    try {
      await sendTelegram(
        `⚠️ Career Inbox: Datenbank nicht erreichbar — Nachtlauf abgebrochen.\n${meldung}\n\nVermutlich hat Supabase das Projekt pausiert. Im Supabase-Dashboard „Resume project“ klicken.`
      );
    } catch {
      /* Telegram auch nicht erreichbar — mehr geht nicht */
    }
    return NextResponse.json({ ok: false, error: `Datenbank nicht erreichbar: ${meldung}` }, { status: 503 });
  }

  const secret = process.env.IMPORT_SECRET;
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

  // Schritte, die komplett gescheitert sind (Timeout, 500, keine Antwort),
  // landen im Protokoll. Einzelne Quellenfehler protokolliert der Schritt selbst.
  const gescheitert = ergebnisse.filter((e) => e.fehler || e.uebersprungen);
  if (gescheitert.length) {
    try {
      await logFehler(
        supabaseAdmin(),
        gescheitert.map((e) => ({
          quelle: "Nachtlauf",
          detail: String(e.schritt),
          meldung: String(e.fehler ?? e.uebersprungen),
        }))
      );
    } catch {
      /* Protokoll darf den Lauf nicht abbrechen */
    }
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ergebnisse });
}
