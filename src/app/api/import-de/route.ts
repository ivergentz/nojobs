import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchBaDetail, searchBaAll, type BaHit } from "@/lib/ba";
import { filterDe, gehaltDe, normalizeDe, SUCHBEGRIFFE } from "@/lib/normalize-de";
import type { JobRow } from "@/lib/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_DEFAULT = 40_000;
const SEARCH_CONCURRENCY = 6;
const DETAIL_CONCURRENCY = 6;
const CURSOR_ID = "de";

/**
 * Import Hamburg + Remote aus der Jobsuche der Bundesagentur.
 *
 * Vorher lief pro Aufruf nur ein Teil der Suchbegriffe, jeweils mit einem
 * Zwei-Tage-Fenster. Beim Tageslauf mit 11 Sekunden Budget kam jeder Begriff
 * nur etwa alle zehn Tage dran — und sah dann nur die letzten zwei Tage.
 * Der Großteil des Markts fiel so lautlos durch.
 *
 * Jetzt:
 *   1. Alle Begriffe in jedem Lauf suchen (schnell, parallel, alle Seiten),
 *      Fenster 7 Tage. Ein ausgefallener Lauf kostet damit nichts.
 *   2. Nur Anzeigen, die noch nicht mit Beschreibung in der Datenbank
 *      liegen, im Detail abrufen. Das ist der teure Teil.
 *   3. Reicht die Zeit nicht, bleibt der Rest offen und kommt beim nächsten
 *      Aufruf dran. `done: false` sagt der Steuerungsseite, dass sie
 *      weiterlaufen soll.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();
  const TIME_BUDGET_MS = Number(url.searchParams.get("budget") ?? TIME_BUDGET_DEFAULT);
  const tage = Number(url.searchParams.get("tage") ?? "7");
  const db = supabaseAdmin();

  const stats = {
    begriffe: 0,
    treffer: 0,
    verworfen: 0,
    kandidaten: 0,
    bekannt: 0,
    details: 0,
    detailsFehlgeschlagen: 0,
    gespeichert: 0,
    offen: 0,
  };
  const gruende: Record<string, number> = {};
  const suchfehler: string[] = [];
  const abgeschnitten: string[] = [];

  try {
    if (url.searchParams.get("reset") === "purge") {
      await db.from("jobs").delete().eq("source", "ba");
      await db.from("dropped_ads").delete().eq("drop_stage", "DE");
      await db.from("import_cursor").delete().eq("id", CURSOR_ID);
      return NextResponse.json({ ok: true, reset: "Deutsche Stellen gelöscht." });
    }

    // ---- 1. Suchen: alle Begriffe, parallel in kleinen Gruppen ----
    const kandidaten = new Map<string, { hit: BaHit; matched: string }>();
    const dropped = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < SUCHBEGRIFFE.length; i += SEARCH_CONCURRENCY) {
      await Promise.all(
        SUCHBEGRIFFE.slice(i, i + SEARCH_CONCURRENCY).map(async (begriff) => {
          try {
            const { hits, gesamt, abgeschnitten: cut } = await searchBaAll({ was: begriff, tage });
            stats.begriffe += 1;
            stats.treffer += hits.length;
            if (cut) abgeschnitten.push(`${begriff} (${hits.length}/${gesamt})`);

            for (const hit of hits) {
              const ref = hit.referenznummer;
              if (!ref || kandidaten.has(ref)) continue;

              const verdict = filterDe(hit, begriff);
              if (verdict.keep) {
                kandidaten.set(ref, { hit, matched: verdict.matched });
                dropped.delete(ref);
                continue;
              }

              if (dropped.has(ref)) continue;
              const key = verdict.reason.split(":")[0];
              gruende[key] = (gruende[key] ?? 0) + 1;
              dropped.set(ref, {
                feed_entry_id: `de-${ref}`,
                uuid: `de-${ref}`,
                title: hit.stellenangebotsTitel ?? null,
                employer_name: hit.firma ?? null,
                municipal: hit.stellenlokationen?.[0]?.adresse?.ort ?? null,
                status: "ACTIVE",
                drop_stage: "DE",
                drop_reason: verdict.reason,
                date_modified: hit.datumErsteVeroeffentlichung ?? null,
              });
            }
          } catch (error) {
            suchfehler.push(error instanceof Error ? error.message : String(error));
          }
        })
      );
    }

    stats.kandidaten = kandidaten.size;
    stats.verworfen = dropped.size;

    // Drop-Log nur für Titel-Ausschlüsse. Die Standort-Absagen sind bundesweit
    // Hunderte pro Tag und würden die Tabelle ohne Erkenntnisgewinn fluten.
    const titelDrops = Array.from(dropped.values()).filter((row) =>
      String(row.drop_reason).startsWith("titel-")
    );
    for (let i = 0; i < titelDrops.length; i += 500) {
      await db
        .from("dropped_ads")
        .upsert(titelDrops.slice(i, i + 500), { onConflict: "feed_entry_id" });
    }

    // ---- 2. Was liegt schon vollständig in der Datenbank? ----
    const uuids = Array.from(kandidaten.keys()).map((ref) => `de-${ref}`);
    const bekannt = new Set<string>();
    for (let i = 0; i < uuids.length; i += 200) {
      const { data, error } = await db
        .from("jobs")
        .select("uuid")
        .in("uuid", uuids.slice(i, i + 200))
        .not("description", "is", null);
      if (error) throw new Error(`Bestand lesen: ${error.message}`);
      for (const row of data ?? []) bekannt.add(row.uuid as string);
    }
    stats.bekannt = bekannt.size;

    // Neueste zuerst — wenn die Zeit knapp wird, sollen die frischen Anzeigen drin sein.
    const neu = Array.from(kandidaten.values())
      .filter(({ hit }) => !bekannt.has(`de-${hit.referenznummer}`))
      .sort((a, b) =>
        String(b.hit.datumErsteVeroeffentlichung ?? "").localeCompare(
          String(a.hit.datumErsteVeroeffentlichung ?? "")
        )
      );

    // ---- 3. Details holen und speichern, solange Zeit ist ----
    let verarbeitet = 0;
    for (let i = 0; i < neu.length; i += DETAIL_CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      const block = neu.slice(i, i + DETAIL_CONCURRENCY);
      const rows: JobRow[] = [];

      await Promise.all(
        block.map(async ({ hit, matched }) => {
          const detail = await fetchBaDetail(hit.referenznummer as string);
          if (detail) stats.details += 1;
          else stats.detailsFehlgeschlagen += 1;

          const gehalt = gehaltDe(hit);
          rows.push({
            ...normalizeDe(hit, detail, matched),
            // Euro-Beträge. Die Spaltennamen sind historisch (NOK).
            salary_min_nok: gehalt.min,
            salary_max_nok: gehalt.max,
            salary_note: gehalt.note,
          } as JobRow & Record<string, unknown>);
        })
      );

      // Blockweise speichern: Bricht der Lauf ab, ist das Erledigte gesichert.
      const { error } = await db.from("jobs").upsert(rows, { onConflict: "uuid" });
      if (error) throw new Error(`Jobs schreiben: ${error.message}`);
      stats.gespeichert += rows.length;
      verarbeitet += block.length;
    }

    stats.offen = neu.length - verarbeitet;
    const done = stats.offen === 0;
    const note = [
      done ? "Aktuell." : `${stats.offen} neue Anzeigen noch ohne Detail — nächster Lauf macht weiter.`,
      suchfehler.length ? `${suchfehler.length} Suchen fehlgeschlagen: ${suchfehler[0]}` : null,
      abgeschnitten.length ? `Abgeschnitten: ${abgeschnitten.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    await logFehler(db, [
      ...suchfehler.slice(0, 10).map((meldung) => ({ quelle: "Arbeitsagentur", detail: "Suche", meldung })),
      ...(stats.detailsFehlgeschlagen > 0
        ? [
            {
              quelle: "Arbeitsagentur",
              detail: "Details",
              meldung: `${stats.detailsFehlgeschlagen} Anzeigen ohne Beschreibung gespeichert (Detailabruf fehlgeschlagen).`,
            },
          ]
        : []),
    ]);

    await db.from("import_cursor").upsert(
      {
        id: CURSOR_ID,
        pages_done: stats.begriffe,
        items_seen: stats.treffer,
        at_end: done,
        last_item_date: new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        last_note: note,
      },
      { onConflict: "id" }
    );

    // Alle Suchen gescheitert heißt: die Quelle ist kaputt oder gesperrt.
    // Das muss als Fehler sichtbar werden, nicht als "0 neue Stellen".
    if (stats.begriffe === 0 && suchfehler.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Alle Suchen fehlgeschlagen: ${suchfehler[0]}`, ...stats },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      done,
      note,
      durationMs: Date.now() - startedAt,
      ...stats,
      gruende,
      suchfehler: suchfehler.slice(0, 3),
      abgeschnitten,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logFehler(db, [{ quelle: "Arbeitsagentur", detail: "Gesamtlauf", meldung: message }]);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
