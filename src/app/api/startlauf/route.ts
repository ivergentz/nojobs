import { NextResponse } from "next/server";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { importiereProfile } from "@/lib/import-profil";
import { leseQuelle } from "@/lib/lesen";
import { ladeProfilVoll } from "@/lib/profil";
import { runEvaluation } from "@/lib/run-evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TAGE = 14;

/**
 * Schritt 2.8 · Startlauf — direkt nach „Suchprofil übernehmen“ die erste Auswahl,
 * statt bis zum nächsten Morgen zu warten. Die Seite ruft das in Runden auf:
 *   POST { schritt: "suchen" }   → Stellen der letzten 14 Tage bei der Arbeitsagentur holen (Antwort: done)
 *   POST { schritt: "bewerten" } → bis zu 60 unbewertete Stellen bewerten (Antwort: evaluated, nochOffen)
 * Nur für das gewählte weitere Profil, nur mit fertigem Suchprofil. Dein Profil ist gesperrt.
 * Wiederholte Aufrufe kosten nichts extra: gesucht wird nur Neues, bewertet nur Unbewertetes.
 */
export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) {
    return NextResponse.json({ error: "Dein Profil läuft über den Nachtlauf — hier wird nichts gestartet." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { schritt?: string };
  if (body.schritt !== "suchen" && body.schritt !== "bewerten") {
    return NextResponse.json({ error: "Unbekannter Schritt." }, { status: 400 });
  }

  const startedAt = Date.now();
  const db = supabaseAdmin();
  try {
    const person = await ladeProfilVoll(db, profil);
    if (!person) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
    if (person.aktiv === false) return NextResponse.json({ error: "Dieses Profil ist deaktiviert." }, { status: 400 });
    if (person.suchbegriffe.length === 0 || !person.suchort.ort || !person.profiltext) {
      return NextResponse.json({ error: "Erst das Suchprofil übernehmen — dann starten Suche und Bewertung." }, { status: 400 });
    }

    if (body.schritt === "suchen") {
      // Ohne deine Lese-Sicht würden fremde Stellen in deiner Inbox landen — dann lieber nichts importieren.
      if (leseQuelle() !== "jobs_sicht") return NextResponse.json({ ok: true, done: true, gespeichert: 0 });
      const { stats, fehler } = await importiereProfile(db, [person], { tage: TAGE, budget: 40_000, startedAt });
      if (fehler.length) {
        await logFehler(db, fehler.slice(0, 5).map((meldung) => ({ quelle: "Arbeitsagentur", detail: "Startlauf", meldung })));
      }
      return NextResponse.json({ ok: true, done: stats.offen === 0, gespeichert: stats.gespeichert, offen: stats.offen });
    }

    const ergebnis = await runEvaluation(db, { budgetMs: 25_000, days: TAGE, limit: 60, anlass: "startlauf", profil });
    if (ergebnis.evaluated === 0 && ergebnis.failed > 0) {
      await logFehler(db, [{ quelle: "Bewertung (Claude)", detail: "Startlauf", meldung: ergebnis.fehlerbeispiele[0] ?? "unbekannt" }]);
      return NextResponse.json({ error: `Bewertung fehlgeschlagen: ${ergebnis.fehlerbeispiele[0] ?? "unbekannt"}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, evaluated: ergebnis.evaluated, failed: ergebnis.failed, nochOffen: ergebnis.nochOffen ?? 0 });
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    await logFehler(db, [{ quelle: "Startlauf", detail: profil, meldung }]);
    return NextResponse.json({ error: meldung }, { status: 500 });
  }
}
