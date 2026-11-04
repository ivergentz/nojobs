import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { leseQuelle } from "@/lib/lesen";
import { ladeProfile, ladeProfilVoll, STANDARD_SLUG } from "@/lib/profil";
import { aktiveBaBegriffe, ladePflege } from "@/lib/suchpflege";
import { adzunaAn, adzunaSuche, begriffeFuerHeute, type AdzunaJob } from "@/lib/sources/adzuna";
import { dublettenKey, ortVerdict, titelVerdict } from "@/lib/sources/text";
import { titelAusgeschlossen } from "@/lib/normalize-de";
import type { BaHit } from "@/lib/ba";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import aus Adzuna — für dein Profil und alle weiteren Profile.
 *
 * Kostenlos, aber mit Grenzen (25/Minute, 250/Tag, 2.500/Monat). Deshalb:
 *   - höchstens ANFRAGEN_PRO_PROFIL Suchen je Profil und Lauf, täglich rotierend durch die Begriffe
 *   - höchstens einmal in 20 Stunden (?force=1 hebt die Sperre auf)
 *   - ohne ADZUNA_APP_ID/ADZUNA_APP_KEY passiert gar nichts
 * Dein Profil: gleiche Titel- und Ortsregeln wie Google Jobs (Hamburg/remote).
 * Weitere Profile: Ort und Umkreis aus dem Suchprofil; neue Stellen tragen import_profil und
 * erscheinen nie in deiner Inbox. Doppelte (Firma + Titel, letzte 45 Tage) werden nicht gespeichert.
 */

const ANFRAGEN_PRO_PROFIL = 5;
const TAGE = 7;

type Auftrag = { slug: string; admin: boolean; begriff: string; wo: string; umkreis: number };

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  if (!adzunaAn()) return NextResponse.json({ ok: true, done: true, gespeichert: 0, hinweis: "Adzuna aus (ADZUNA_APP_ID/ADZUNA_APP_KEY nicht gesetzt)." });

  const url = new URL(request.url);
  const startedAt = Date.now();
  const db = supabaseAdmin();
  const stats = { suchen: 0, treffer: 0, passend: 0, doppelt: 0, neu: 0, profile: 0 };
  const log: Array<{ quelle: string; detail: string | null; meldung: string }> = [];
  const gruende: Record<string, number> = {};

  try {
    const { data: cursor } = await db.from("import_cursor").select("last_run_at").eq("id", "adzuna").maybeSingle();
    const letzter = cursor?.last_run_at ? new Date(cursor.last_run_at as string).getTime() : 0;
    if (url.searchParams.get("force") !== "1" && Date.now() - letzter < 20 * 3600e3) {
      return NextResponse.json({ ok: true, done: true, gespeichert: 0, hinweis: "heute schon gelaufen" });
    }

    // ---- Aufträge: dein Profil + weitere Profile (nur mit Lese-Sicht, sonst landeten fremde Stellen bei dir)
    const auftraege: Auftrag[] = [];
    const tag = Math.floor(Date.now() / 864e5);
    for (const begriff of begriffeFuerHeute(aktiveBaBegriffe(await ladePflege(db, STANDARD_SLUG)), ANFRAGEN_PRO_PROFIL, tag))
      auftraege.push({ slug: STANDARD_SLUG, admin: true, begriff, wo: "Hamburg", umkreis: 25 });
    stats.profile = 1;
    if (leseQuelle() === "jobs_sicht") {
      const { profile } = await ladeProfile(db);
      for (const p of profile) {
        if (p.rolle === "admin" || p.aktiv === false || p.geloescht) continue;
        const voll = await ladeProfilVoll(db, p.slug);
        if (!voll || !voll.suchbegriffe.length || !voll.suchort.ort) continue;
        stats.profile += 1;
        for (const begriff of begriffeFuerHeute(voll.suchbegriffe.slice(0, 15), ANFRAGEN_PRO_PROFIL, tag))
          auftraege.push({ slug: voll.slug, admin: false, begriff, wo: voll.suchort.ort, umkreis: voll.suchort.umkreis });
      }
    }

    // ---- Abrufen: in kleinen Gruppen, deutlich unter 25 pro Minute; bei Rate-Limit sofort aufhören
    const gefunden: Array<{ a: Auftrag; job: AdzunaJob }> = [];
    let abbruch = false;
    for (let i = 0; i < auftraege.length && !abbruch; i += 5) {
      await Promise.all(
        auftraege.slice(i, i + 5).map(async (a) => {
          try {
            const jobs = await adzunaSuche({ was: a.begriff, wo: a.wo, umkreis: a.umkreis, tage: TAGE });
            stats.suchen += 1;
            stats.treffer += jobs.length;
            for (const job of jobs) gefunden.push({ a, job });
          } catch (err) {
            const meldung = err instanceof Error ? err.message : String(err);
            if (/429/.test(meldung)) abbruch = true;
            log.push({ quelle: "Adzuna", detail: a.begriff, meldung });
          }
        })
      );
    }

    // ---- Bestand für den Dubletten-Abgleich (wie beim Google-Import)
    const seit = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data: bestand, error: bestandError } = await db.from("jobs").select("uuid,employer_name,title").gte("imported_at", seit).limit(5000);
    if (bestandError) throw new Error(`Bestand lesen: ${bestandError.message}`);
    const uuids = new Set((bestand ?? []).map((r) => r.uuid as string));
    const schluessel = new Set((bestand ?? []).map((r) => dublettenKey(String(r.employer_name ?? ""), String(r.title ?? ""))));

    // ---- Filtern und speichern (dein Profil zuerst: findet deine Suche eine Stelle, bleibt sie deine)
    const rows: Record<string, unknown>[] = [];
    const jetzt = new Date().toISOString();
    for (const { a, job } of [...gefunden.filter((g) => g.a.admin), ...gefunden.filter((g) => !g.a.admin)]) {
      let matchTerm: string;
      if (a.admin) {
        const titel = titelVerdict(job.title);
        if (!titel.keep) { gruende[titel.reason.split(":")[0]] = (gruende[titel.reason.split(":")[0]] ?? 0) + 1; continue; }
        const ort = ortVerdict(job.location, null, job.description);
        if (!ort.keep) { gruende[ort.reason] = (gruende[ort.reason] ?? 0) + 1; continue; }
        matchTerm = `${ort.art}:adzuna`;
      } else {
        if (titelAusgeschlossen({ stellenangebotsTitel: job.title } as BaHit)) { gruende["titel-ausschluss"] = (gruende["titel-ausschluss"] ?? 0) + 1; continue; }
        matchTerm = `profil:${a.slug}:${a.begriff}`;
      }
      stats.passend += 1;
      const uuid = `adzuna-${job.id}`;
      const k = dublettenKey(job.company, job.title);
      if (uuids.has(uuid) || schluessel.has(k)) { stats.doppelt += 1; continue; }
      uuids.add(uuid);
      schluessel.add(k);
      rows.push({
        uuid,
        source: "adzuna",
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
        sector: null,
        occupation_level1: null,
        occupation_level2: null,
        categories: null,
        match_term: matchTerm,
        raw: { suche: a.begriff, adzuna: { gehalt_min: job.salaryMin, gehalt_max: job.salaryMax, gehalt_geschaetzt: job.salaryGeschaetzt } },
        imported_at: jetzt,
        ...(a.admin ? {} : { import_profil: a.slug }),
      });
    }

    await logFehler(db, log);
    // Zeilen mit und ohne import_profil getrennt schreiben (gleiche Spalten je Block)
    for (const block of [rows.filter((r) => !("import_profil" in r)), rows.filter((r) => "import_profil" in r)]) {
      for (let i = 0; i < block.length; i += 200) {
        const { error } = await db.from("jobs").upsert(block.slice(i, i + 200), { onConflict: "uuid", ignoreDuplicates: true });
        if (error) throw new Error(`Jobs schreiben: ${error.message}`);
      }
    }
    stats.neu = rows.length;

    await db.from("import_cursor").upsert(
      [{ id: "adzuna", pages_done: stats.suchen, items_seen: stats.treffer, at_end: true, last_item_date: jetzt, last_run_at: jetzt, last_note: `${stats.suchen} Suchen für ${stats.profile} Profile, ${stats.treffer} Treffer, ${stats.neu} neu.` }],
      { onConflict: "id" }
    );

    return NextResponse.json({ ok: true, done: true, durationMs: Date.now() - startedAt, ...stats, gespeichert: stats.neu, gruende, abgebrochen: abbruch, fehler: log.slice(0, 3).map((l) => l.meldung) });
  } catch (error) {
    const meldung = error instanceof Error ? error.message : String(error);
    await logFehler(db, [{ quelle: "Adzuna", detail: "Import", meldung }]);
    return NextResponse.json({ ok: false, error: meldung }, { status: 500 });
  }
}
