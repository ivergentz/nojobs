import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import firmenDatei from "@/data/firmen.json";
import { atsUuid, fetchFirmenJobs, type Firma } from "@/lib/sources/ats";
import { dublettenKey, ortVerdict, titelVerdict } from "@/lib/sources/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 20; // alle Firmen parallel — hält den Nachtlauf unter 60 Sekunden
const CURSOR_ID = "ats";

/**
 * Import aus den Karriereseiten der Firmen in src/data/firmen.json.
 *
 * Pro Firma ein Abruf des öffentlichen Feeds. Gespeichert wird nur, was nach
 * Titel (Produkt/KI/Digital) und Ort (Hamburg/remote) passt. Stellen, die aus
 * dem Feed einer Firma verschwunden sind, werden auf INACTIVE gesetzt —
 * die Firma hat sie besetzt oder zurückgezogen.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = supabaseAdmin();
  const firmen = ((firmenDatei as { firmen: Firma[] }).firmen ?? []).filter((f) => f.aktiv !== false);

  const stats = { firmen: firmen.length, gelesen: 0, stellen: 0, passend: 0, neu: 0, deaktiviert: 0 };
  const fehler: string[] = [];
  const log: Array<{ quelle: string; detail: string; meldung: string }> = [];
  const gruende: Record<string, number> = {};

  try {
    // Was liegt schon vollständig vor? Spart bei SmartRecruiters die Detailabrufe.
    const { data: bekanntRows, error: bekanntError } = await db
      .from("jobs")
      .select("uuid")
      .eq("source", "ats")
      .not("description", "is", null);
    if (bekanntError) throw new Error(`Bestand lesen: ${bekanntError.message}`);
    const bekannt = new Set((bekanntRows ?? []).map((row) => row.uuid as string));

    // Dieselbe Stelle steht oft auch bei der Arbeitsagentur oder Google Jobs.
    const { data: andere } = await db
      .from("jobs")
      .select("employer_name,title")
      .neq("source", "ats")
      .gte("imported_at", new Date(Date.now() - 45 * 864e5).toISOString())
      .limit(5000);
    const schluessel = new Set(
      (andere ?? []).map((row) => dublettenKey(String(row.employer_name ?? ""), String(row.title ?? "")))
    );

    const rows: Record<string, unknown>[] = [];
    const aktuelleIds = new Map<string, Set<string>>(); // Präfix → uuids im Feed

    for (let i = 0; i < firmen.length; i += CONCURRENCY) {
      await Promise.all(
        firmen.slice(i, i + CONCURRENCY).map(async (firma) => {
          try {
            const jobs = await fetchFirmenJobs(firma, (id) => !bekannt.has(atsUuid(firma, id)));
            stats.gelesen += 1;
            stats.stellen += jobs.length;
            const prefix = atsUuid(firma, "");
            const imFeed = new Set<string>();
            aktuelleIds.set(prefix, imFeed);

            for (const job of jobs) {
              const uuid = atsUuid(firma, job.id);
              imFeed.add(uuid);

              const titel = titelVerdict(job.title);
              if (!titel.keep) {
                gruende[titel.reason.split(":")[0]] = (gruende[titel.reason.split(":")[0]] ?? 0) + 1;
                continue;
              }
              const ort = ortVerdict(job.location, job.remote);
              if (!ort.keep) {
                gruende[ort.reason] = (gruende[ort.reason] ?? 0) + 1;
                continue;
              }
              stats.passend += 1;
              if (bekannt.has(uuid)) continue;
              if (schluessel.has(dublettenKey(firma.name, job.title))) {
                gruende.doppelt = (gruende.doppelt ?? 0) + 1;
                continue;
              }

              rows.push({
                uuid,
                source: "ats",
                status: "ACTIVE",
                title: job.title,
                employer_name: firma.name,
                employer_homepage: null,
                municipal: job.location || null,
                county: null,
                country: "Deutschland",
                published: job.published,
                expires: null,
                updated: null,
                application_url: job.url,
                application_due: null,
                source_url: job.url,
                description: job.description || null,
                extent: null,
                engagement_type: null,
                sector: job.remote ? "Remote möglich" : null,
                occupation_level1: null,
                occupation_level2: null,
                categories: null,
                match_term: `${ort.art}:${firma.name}`,
                raw: { ats: firma.ats, slug: firma.slug, id: job.id },
                imported_at: new Date().toISOString(),
              });
            }
          } catch (error) {
            const meldung = error instanceof Error ? error.message : String(error);
            fehler.push(`${firma.name}: ${meldung}`);
            log.push({
              quelle: "Karriereseite",
              detail: `${firma.name} (${firma.ats}/${firma.slug})`,
              meldung,
            });
          }
        })
      );
    }

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("jobs").upsert(rows.slice(i, i + 200), { onConflict: "uuid" });
      if (error) throw new Error(`Jobs schreiben: ${error.message}`);
    }
    stats.neu = rows.length;

    // Verschwundene Stellen stilllegen — nur für Firmen, deren Feed geantwortet hat.
    for (const [prefix, imFeed] of aktuelleIds) {
      const { data: gespeichert } = await db
        .from("jobs")
        .select("uuid")
        .eq("source", "ats")
        .eq("status", "ACTIVE")
        .like("uuid", `${prefix}%`);
      const weg = (gespeichert ?? []).map((row) => row.uuid as string).filter((uuid) => !imFeed.has(uuid));
      if (weg.length) {
        await db.from("jobs").update({ status: "INACTIVE" }).in("uuid", weg);
        stats.deaktiviert += weg.length;
      }
    }

    await logFehler(db, log);

    const note =
      `${stats.gelesen}/${stats.firmen} Firmen gelesen, ${stats.passend} passende Stellen, ${stats.neu} neu.` +
      (fehler.length ? ` Fehler: ${fehler.slice(0, 3).join("; ")}` : "");

    await db.from("import_cursor").upsert(
      {
        id: CURSOR_ID,
        pages_done: stats.gelesen,
        items_seen: stats.stellen,
        at_end: true,
        last_item_date: new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        last_note: note,
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      ok: true,
      done: true,
      note,
      durationMs: Date.now() - startedAt,
      ...stats,
      gespeichert: stats.neu,
      gruende,
      fehler,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logFehler(db, [...log, { quelle: "Karriereseite", detail: "Gesamtlauf", meldung: message }]);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
