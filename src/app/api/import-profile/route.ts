import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchBaDetail, searchBaAll, type BaHit } from "@/lib/ba";
import { gehaltDe, normalizeDe, titelAusgeschlossen } from "@/lib/normalize-de";
import { ladeProfile, ladeProfilVoll, type ProfilVoll } from "@/lib/profil";
import { leseQuelle } from "@/lib/lesen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DETAIL_CONCURRENCY = 6;
const MAX_NEU_PRO_LAUF = 120;

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

    const stats = { profile: bereit.length, suchen: 0, treffer: 0, neu: 0, bekannt: 0, gespeichert: 0, offen: 0 };
    const fehler: string[] = [];

    for (const profil of bereit) {
      // 1. Suchen
      const kandidaten = new Map<string, { hit: BaHit; begriff: string }>();
      await Promise.all(
        profil.suchbegriffe.slice(0, 15).map(async (begriff) => {
          try {
            const { hits } = await searchBaAll({ was: begriff, tage, maxSeiten: 2, wo: profil.suchort.ort as string, umkreis: profil.suchort.umkreis });
            stats.suchen += 1;
            stats.treffer += hits.length;
            for (const hit of hits) {
              if (!hit.referenznummer || kandidaten.has(hit.referenznummer) || titelAusgeschlossen(hit)) continue;
              kandidaten.set(hit.referenznummer, { hit, begriff });
            }
          } catch (err) {
            fehler.push(`${profil.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );

      // 2. Schon vorhanden? (egal für wen importiert — eine Stelle gibt es nur einmal)
      const uuids = Array.from(kandidaten.keys()).map((ref) => `de-${ref}`);
      const bekannt = new Set<string>();
      for (let i = 0; i < uuids.length; i += 200) {
        const { data, error } = await db.from("jobs").select("uuid").in("uuid", uuids.slice(i, i + 200)).not("description", "is", null);
        if (error) throw new Error(`Bestand lesen: ${error.message}`);
        for (const row of data ?? []) bekannt.add(row.uuid as string);
      }
      stats.bekannt += bekannt.size;
      const neu = Array.from(kandidaten.values())
        .filter(({ hit }) => !bekannt.has(`de-${hit.referenznummer}`))
        .sort((a, b) => String(b.hit.datumErsteVeroeffentlichung ?? "").localeCompare(String(a.hit.datumErsteVeroeffentlichung ?? "")))
        .slice(0, MAX_NEU_PRO_LAUF);
      stats.neu += neu.length;

      // 3. Details holen und speichern, solange Zeit ist
      let verarbeitet = 0;
      for (let i = 0; i < neu.length; i += DETAIL_CONCURRENCY) {
        if (Date.now() - startedAt > budget) break;
        const block = neu.slice(i, i + DETAIL_CONCURRENCY);
        const rows = await Promise.all(
          block.map(async ({ hit, begriff }) => {
            const detail = await fetchBaDetail(hit.referenznummer as string);
            const gehalt = gehaltDe(hit);
            return {
              ...normalizeDe(hit, detail, `profil:${profil.slug}:${begriff}`),
              salary_min_nok: gehalt.min,
              salary_max_nok: gehalt.max,
              salary_note: gehalt.note,
              import_profil: profil.slug,
            };
          })
        );
        // ignoreDuplicates: hat deine Suche die Stelle inzwischen selbst geholt, bleibt sie deine.
        const { error } = await db.from("jobs").upsert(rows, { onConflict: "uuid", ignoreDuplicates: true });
        if (error) throw new Error(`Jobs schreiben: ${error.message}`);
        stats.gespeichert += rows.length;
        verarbeitet += block.length;
      }
      stats.offen += neu.length - verarbeitet;
    }

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
