import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { arbeitnow, googleJobs, GOOGLE_SUCHEN, type SammelJob } from "@/lib/sources/aggregatoren";
import { dublettenKey, ortVerdict, titelVerdict } from "@/lib/sources/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import aus Google Jobs (über SerpApi, falls SERPAPI_KEY gesetzt) und Arbeitnow.
 *
 * Google Jobs kostet Kontingent (250 Suchen/Monat gratis). Deshalb läuft es
 * höchstens einmal in 20 Stunden — egal wie oft die Steuerung den Import
 * anstößt. ?force=1 hebt die Sperre auf.
 *
 * Dieselbe Stelle taucht oft in mehreren Quellen auf (Arbeitsagentur,
 * Karriereseite, Google). Doppelte werden über Firma + Titel erkannt und
 * nicht noch einmal gespeichert — sonst bewertet und meldet das System sie
 * mehrfach.
 */

const key = dublettenKey;

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startedAt = Date.now();
  const db = supabaseAdmin();
  const stats = { google: 0, arbeitnow: 0, passend: 0, doppelt: 0, neu: 0, googleSuchen: 0 };
  const fehler: string[] = [];
  const log: Array<{ quelle: string; detail: string | null; meldung: string }> = [];
  const gruende: Record<string, number> = {};

  try {
    // ---- Darf Google heute laufen? ----
    const { data: googleCursor } = await db
      .from("import_cursor")
      .select("last_run_at")
      .eq("id", "google")
      .maybeSingle();
    const letzterGoogleLauf = googleCursor?.last_run_at ? new Date(googleCursor.last_run_at as string).getTime() : 0;
    const googleAn = Boolean(process.env.SERPAPI_KEY);
    const googleFaellig = googleAn && (url.searchParams.get("force") === "1" || Date.now() - letzterGoogleLauf > 20 * 3600e3);

    // ---- Abrufen ----
    const gesammelt: Array<{ quelle: "google" | "arbeitnow"; job: SammelJob }> = [];

    const aufgaben: Array<Promise<void>> = [
      arbeitnow()
        .then((jobs) => {
          stats.arbeitnow = jobs.length;
          jobs.forEach((job) => gesammelt.push({ quelle: "arbeitnow", job }));
        })
        .catch((error) => {
          const meldung = error instanceof Error ? error.message : String(error);
          fehler.push(`Arbeitnow: ${meldung}`);
          log.push({ quelle: "Arbeitnow", detail: null, meldung });
        }),
    ];

    if (googleFaellig) {
      for (const suche of GOOGLE_SUCHEN) {
        aufgaben.push(
          googleJobs(suche)
            .then((jobs) => {
              stats.googleSuchen += 1;
              stats.google += jobs.length;
              jobs.forEach((job) => gesammelt.push({ quelle: "google", job }));
            })
            .catch((error) => {
              const meldung = error instanceof Error ? error.message : String(error);
              fehler.push(`Google „${suche.q}“: ${meldung}`);
              log.push({ quelle: "Google Jobs", detail: suche.q, meldung });
            })
        );
      }
    }

    await Promise.all(aufgaben);

    // ---- Bestand für Dubletten-Abgleich ----
    const seit = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data: bestand, error: bestandError } = await db
      .from("jobs")
      .select("uuid,employer_name,title")
      .gte("imported_at", seit)
      .limit(5000);
    if (bestandError) throw new Error(`Bestand lesen: ${bestandError.message}`);
    const uuids = new Set((bestand ?? []).map((row) => row.uuid as string));
    const schluessel = new Set(
      (bestand ?? []).map((row) => key(String(row.employer_name ?? ""), String(row.title ?? "")))
    );

    // ---- Filtern und speichern ----
    const rows: Record<string, unknown>[] = [];
    for (const { quelle, job } of gesammelt) {
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

      const uuid = `${quelle}-${job.id}`;
      const k = key(job.company, job.title);
      if (uuids.has(uuid) || schluessel.has(k)) {
        stats.doppelt += 1;
        continue;
      }
      uuids.add(uuid);
      schluessel.add(k);

      rows.push({
        uuid,
        source: quelle,
        status: "ACTIVE",
        title: job.title,
        employer_name: job.company || null,
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
        occupation_level1: job.via ? `via ${job.via}` : null,
        occupation_level2: null,
        categories: null,
        match_term: `${ort.art}:${quelle}`,
        raw: { via: job.via },
        imported_at: new Date().toISOString(),
      });
    }

    await logFehler(db, log);

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("jobs").upsert(rows.slice(i, i + 200), { onConflict: "uuid" });
      if (error) throw new Error(`Jobs schreiben: ${error.message}`);
    }
    stats.neu = rows.length;

    const jetzt = new Date().toISOString();
    const cursorZeilen = [
      {
        id: "arbeitnow",
        pages_done: 0,
        items_seen: stats.arbeitnow,
        at_end: true,
        last_item_date: jetzt,
        last_run_at: jetzt,
        last_note: `${stats.arbeitnow} gelesen.`,
      },
    ];
    if (googleFaellig) {
      cursorZeilen.push({
        id: "google",
        pages_done: stats.googleSuchen,
        items_seen: stats.google,
        at_end: true,
        last_item_date: jetzt,
        last_run_at: jetzt,
        last_note: `${stats.googleSuchen} Suchen, ${stats.google} Treffer.`,
      });
    }
    await db.from("import_cursor").upsert(cursorZeilen, { onConflict: "id" });

    return NextResponse.json({
      ok: true,
      done: true,
      durationMs: Date.now() - startedAt,
      googleStatus: googleAn ? (googleFaellig ? "gelaufen" : "heute schon gelaufen") : "aus (kein SERPAPI_KEY)",
      ...stats,
      gespeichert: stats.neu,
      gruende,
      fehler,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logFehler(db, [{ quelle: "Google Jobs & Arbeitnow", detail: "Gesamtlauf", meldung: message }]);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
