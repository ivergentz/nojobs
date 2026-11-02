import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { importiereProfile } from "@/lib/import-profil";
import { ladeProfile, ladeProfilVoll, type ProfilVoll } from "@/lib/profil";
import { leseQuelle } from "@/lib/lesen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Schritt 2.7 · Import pro Profil (Arbeitsagentur).
 *
 * Sucht mit den Suchbegriffen jedes weiteren Profils an dessen Ort und Umkreis.
 * Neue Stellen bekommen import_profil = Profil-Schlüssel: Sie erscheinen NICHT
 * in deiner Inbox und kosten dich keine Bewertung (deine Sicht blendet sie aus).
 * Deine eigene Suche (import-de) bleibt völlig unverändert.
 *
 *   ?profil=<schlüssel>  nur dieses Profil (Knopf in der Steuerung)
 *   ?tage=N              Zeitfenster (Standard 7)
 *   ?budget=ms           Zeitbudget
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request)) return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });

  // Ohne deine Lese-Sicht würden fremde Stellen in deiner Inbox landen — dann lieber nichts importieren.
  if (leseQuelle() !== "jobs_sicht") {
    return NextResponse.json({ ok: true, done: true, gespeichert: 0, hinweis: "Import pro Profil braucht LESEN_AUS=matches." });
  }

  const startedAt = Date.now();
  const budget = Math.min(Number(url.searchParams.get("budget") ?? "40000"), 45_000);
  const tage = Math.min(Math.max(Number(url.searchParams.get("tage") ?? "7"), 1), 30);
  const db = supabaseAdmin();
  const nur = url.searchParams.get("profil");

  try {
    // Welche Profile? Nur aktive weitere Profile mit Suchbegriffen und Ort.
    let profile: ProfilVoll[] = [];
    if (nur) {
      const p = await ladeProfilVoll(db, nur);
      if (p) profile = [p];
    } else {
      const { profile: alle } = await ladeProfile(db);
      for (const p of alle) {
        if (p.rolle === "admin" || p.aktiv === false) continue;
        const voll = await ladeProfilVoll(db, p.slug);
        if (voll) profile.push(voll);
      }
    }
    const bereit = profile.filter((p) => p.rolle !== "admin" && p.aktiv !== false && p.suchbegriffe.length > 0 && p.suchort.ort);
    if (bereit.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        gespeichert: 0,
        hinweis: nur ? "Für dieses Profil fehlen Suchbegriffe oder Ort." : "Kein weiteres Profil mit Suchbegriffen und Ort.",
      });
    }

    const { stats, fehler } = await importiereProfile(db, bereit, { tage, budget, startedAt });

    if (fehler.length) {
      await logFehler(db, fehler.slice(0, 5).map((meldung) => ({ quelle: "Arbeitsagentur", detail: "Import pro Profil", meldung })));
    }
    return NextResponse.json({ ok: true, done: stats.offen === 0, durationMs: Date.now() - startedAt, ...stats, fehler: fehler.slice(0, 3) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logFehler(db, [{ quelle: "Arbeitsagentur", detail: "Import pro Profil", meldung: message }]);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
