import { createHash } from "node:crypto";
import { baUrl, fetchBaDetail, searchBaAll, type BaHit } from "../../src/lib/ba";
import { filterDe, titelAusgeschlossen } from "../../src/lib/normalize-de";
import type { Abruf, BenchJob, BenchProfil } from "./typen";

/**
 * Abfrage der drei Quellen — ausschließlich lesend, keine Datenbank.
 * Keine automatischen Wiederholungen: Ein Fehler oder Rate-Limit beendet die Abfragen dieser Quelle.
 * Secrets werden nie ausgegeben; Fehlermeldungen werden um Schlüssel bereinigt.
 */

const kurz = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const ohneHtml = (v: unknown) => text(typeof v === "string" ? v.replace(/<[^>]+>/g, " ") : "");

export function bereinige(meldung: string): string {
  let m = meldung;
  for (const name of ["SERPAPI_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "BA_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const wert = process.env[name];
    if (wert && wert.length >= 4) m = m.split(wert).join("***");
  }
  return m.replace(/(api_key|app_key|app_id)=[^&\s"]+/gi, "$1=***").slice(0, 300);
}

/* ------------------------------------------------------------------ BA */

export function baZuBench(hit: BaHit, profil: BenchProfil, begriff: string, beschreibung: string | null): BenchJob {
  const adresse = hit.stellenlokationen?.[0]?.adresse ?? null;
  const gehalt =
    typeof hit.gehaltsspanneVon === "number" || typeof hit.gehaltsspanneBis === "number"
      ? `${hit.gehaltsspanneVon ?? "?"}–${hit.gehaltsspanneBis ?? "?"}`
      : /\d/.test(text(hit.verguetungsangabe)) ? text(hit.verguetungsangabe) : null; // „KEINE_ANGABEN“, „JAHRESGEHALT“ … sind keine Angabe
  return {
    source: "ba",
    source_id: String(hit.referenznummer ?? ""),
    title: text(hit.stellenangebotsTitel),
    company: text(hit.firma),
    location: [adresse?.plz, adresse?.ort].filter(Boolean).join(" ") || text(adresse?.region),
    remote: hit.homeofficemoeglich === true ? true : hit.homeofficemoeglich === false ? false : null,
    salary: gehalt,
    description: beschreibung,
    published_at: hit.datumErsteVeroeffentlichung ? new Date(hit.datumErsteVeroeffentlichung).toISOString() : null,
    url: text(hit.externeUrl) || (hit.referenznummer ? baUrl(hit.referenznummer) : null),
    profile_id: profil.id,
    suchbegriff: begriff,
    via: null,
    arbeitgeber_link: hit.externeUrl ? true : null,
  };
}

/**
 * Wie der produktive Import: weitere Profile mit Ort + Umkreis (2 Seiten à 100),
 * dein Profil bundesweit (5 Seiten à 100) mit anschließendem Hamburg-/Remote-Filter (filterDe).
 */
export async function abfrageBa(profil: BenchProfil, begriffe: string[], tage: number, seiten: number, details: number): Promise<{ jobs: BenchJob[]; abrufe: Abruf[] }> {
  const jobs: BenchJob[] = [];
  const abrufe: Abruf[] = [];
  const treffer: Array<{ hit: BaHit; begriff: string }> = [];
  for (const begriff of begriffe) {
    try {
      const ort = profil.rolle === "nutzer" && profil.ort ? { wo: profil.ort, umkreis: profil.umkreis } : {};
      const { hits } = await searchBaAll({ was: begriff, tage, maxSeiten: profil.rolle === "admin" ? 5 : seiten, ...ort });
      // Wie produktiv: dein Profil → filterDe (Ausschlüsse + Hamburg/remote), weitere Profile → nur Titel-Ausschlüsse.
      const behalten = profil.rolle === "admin" ? hits.filter((h) => filterDe(h, begriff).keep) : hits.filter((h) => !titelAusgeschlossen(h));
      abrufe.push({ quelle: "ba", profil: profil.id, suchbegriff: begriff, ok: true, anzeigen: behalten.length, fehler: null, kontingent: false, art: "suche" });
      for (const hit of behalten) if (hit.referenznummer) treffer.push({ hit, begriff });
    } catch (err) {
      abrufe.push({ quelle: "ba", profil: profil.id, suchbegriff: begriff, ok: false, anzeigen: 0, fehler: bereinige(String(err instanceof Error ? err.message : err)), kontingent: false, art: "suche" });
    }
  }
  // Beschreibung steht bei der BA nur im Detail — eine kleine Stichprobe genügt, um die Vollständigkeit zu messen.
  const stichprobe = new Set(treffer.slice(0, details).map((t) => t.hit.referenznummer as string));
  for (const { hit, begriff } of treffer) {
    let beschreibung: string | null = null;
    if (stichprobe.has(hit.referenznummer as string)) {
      const detail = await fetchBaDetail(hit.referenznummer as string);
      abrufe.push({ quelle: "ba", profil: profil.id, suchbegriff: begriff, ok: Boolean(detail), anzeigen: detail ? 1 : 0, fehler: detail ? null : "Detail nicht abrufbar", kontingent: false, art: "detail" });
      beschreibung = ohneHtml(detail?.stellenangebotsBeschreibung) || null;
      stichprobe.delete(hit.referenznummer as string);
    }
    jobs.push(baZuBench(hit, profil, begriff, beschreibung));
  }
  return { jobs, abrufe };
}

/* ---------------------------------------------------------- Google Jobs */

export type SerpKonto = { plan: string; proMonat: number | null; uebrig: number; dieserMonat: number | null };

/** Kontostand über die Account-API von SerpApi (zählt nicht als Suche). */
export async function serpKonto(key: string): Promise<SerpKonto> {
  const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`SerpApi-Konto: HTTP ${res.status}`);
  const b = (await res.json()) as Record<string, unknown>;
  const uebrig = Number(b.total_searches_left ?? b.plan_searches_left);
  if (!Number.isFinite(uebrig)) throw new Error("SerpApi-Konto: Restkontingent nicht lesbar");
  return {
    plan: text(b.plan_name) || text(b.plan_id) || "unbekannt",
    proMonat: Number.isFinite(Number(b.searches_per_month)) ? Number(b.searches_per_month) : null,
    uebrig,
    dieserMonat: Number.isFinite(Number(b.this_month_usage)) ? Number(b.this_month_usage) : null,
  };
}

/** „vor 3 Tagen“ / „3 days ago“ → ungefähres Datum (wie im produktiven Import). */
export function googleDatum(v: unknown, jetzt = Date.now()): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/(\d+)\s*(stunde|hour|tag|day|woche|week|monat|month)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const e = m[2].toLowerCase();
  const tage = /^(stunde|hour)/.test(e) ? 0 : /^(tag|day)/.test(e) ? n : /^(woche|week)/.test(e) ? n * 7 : n * 30;
  return new Date(jetzt - tage * 864e5).toISOString();
}

const BOERSE = /linkedin|indeed|stepstone|xing|glassdoor|jooble|kimeta|jobware|monster|stellenanzeigen|meinestadt|talent\.com|jobrapido|adzuna|arbeitsagentur/i;

export function googleZuBench(job: Record<string, any>, profil: BenchProfil, begriff: string, jetzt = Date.now()): BenchJob {
  const ext = (job.detected_extensions ?? {}) as Record<string, unknown>;
  const apply = (Array.isArray(job.apply_options) ? job.apply_options : []) as Array<{ title?: string; link?: string }>;
  const direkt = apply.find((o) => !BOERSE.test(`${o.title ?? ""} ${o.link ?? ""}`));
  const ort = text(job.location);
  return {
    source: "google",
    source_id: kurz(String(job.job_id ?? `${job.company_name}|${job.title}|${ort}`)),
    title: text(job.title),
    company: text(job.company_name),
    location: ort,
    remote: ext.work_from_home === true || /remote|homeoffice/i.test(ort) ? true : null,
    salary: text(ext.salary) || null,
    description: text(job.description) || null,
    published_at: googleDatum(ext.posted_at, jetzt),
    url: text(direkt?.link) || text(apply[0]?.link) || text(job.share_link) || null,
    profile_id: profil.id,
    suchbegriff: begriff,
    via: text(job.via).replace(/^(über|via)\s+/i, "") || null,
    arbeitgeber_link: Boolean(direkt),
  };
}

export function googleOrt(profil: BenchProfil): string {
  const ort = profil.rolle === "admin" ? "Hamburg" : profil.ort;
  return ort ? `${ort}, Germany` : "Germany";
}

export async function abfrageGoogle(profil: BenchProfil, begriffe: string[], key: string): Promise<{ jobs: BenchJob[]; abrufe: Abruf[]; abgebrochen: string | null }> {
  const jobs: BenchJob[] = [];
  const abrufe: Abruf[] = [];
  for (const begriff of begriffe) {
    const params = new URLSearchParams({ engine: "google_jobs", q: begriff, location: googleOrt(profil), gl: "de", hl: "de", api_key: key });
    // Umkreis: Google Jobs kennt „lrad“ (km). Wird laut Erfahrung nicht immer streng eingehalten.
    if (profil.rolle === "nutzer" && profil.ort) params.set("lrad", String(profil.umkreis));
    try {
      const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        abrufe.push({ quelle: "google", profil: profil.id, suchbegriff: begriff, ok: false, anzeigen: 0, fehler: "Rate-Limit (429) — Abbruch ohne Wiederholung", kontingent: false, art: "suche" });
        return { jobs, abrufe, abgebrochen: "Rate-Limit" };
      }
      const body = (await res.json().catch(() => ({}))) as { jobs_results?: any[]; error?: string };
      const leer = body.error && /hasn't returned any results/i.test(body.error);
      if (!res.ok || (body.error && !leer)) throw new Error(`HTTP ${res.status} ${body.error ?? ""}`);
      const liste = body.jobs_results ?? [];
      abrufe.push({ quelle: "google", profil: profil.id, suchbegriff: begriff, ok: true, anzeigen: liste.length, fehler: null, kontingent: true, art: "suche" });
      for (const j of liste) jobs.push(googleZuBench(j, profil, begriff));
    } catch (err) {
      // SerpApi zählt fehlerhafte Suchen laut Preisseite nicht — trotzdem kein weiterer Versuch.
      abrufe.push({ quelle: "google", profil: profil.id, suchbegriff: begriff, ok: false, anzeigen: 0, fehler: bereinige(String(err instanceof Error ? err.message : err)), kontingent: false, art: "suche" });
      return { jobs, abrufe, abgebrochen: "Fehler" };
    }
  }
  return { jobs, abrufe, abgebrochen: null };
}

/* ---------------------------------------------------------------- Adzuna */

export function adzunaZuBench(job: Record<string, any>, profil: BenchProfil, begriff: string): BenchJob {
  const min = Number(job.salary_min);
  const max = Number(job.salary_max);
  const geschaetzt = String(job.salary_is_predicted) === "1";
  const gehalt = Number.isFinite(min) || Number.isFinite(max) ? `${Number.isFinite(min) ? Math.round(min) : "?"}–${Number.isFinite(max) ? Math.round(max) : "?"}${geschaetzt ? " (Schätzung Adzuna)" : ""}` : null;
  const ort = text(job.location?.display_name) || (Array.isArray(job.location?.area) ? job.location.area.slice(-1)[0] : "");
  return {
    source: "adzuna",
    source_id: String(job.id ?? kurz(`${job.company?.display_name}|${job.title}`)),
    title: ohneHtml(job.title),
    company: text(job.company?.display_name),
    location: text(ort),
    remote: /remote|homeoffice|home office/i.test(`${job.title} ${ort}`) ? true : null,
    salary: gehalt,
    description: ohneHtml(job.description) || null,
    published_at: job.created ? new Date(job.created).toISOString() : null,
    url: text(job.redirect_url) || null,
    profile_id: profil.id,
    suchbegriff: begriff,
    via: null,
    arbeitgeber_link: false,
  };
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function abfrageAdzuna(
  profil: BenchProfil,
  begriffe: string[],
  zugang: { id: string; key: string },
  tage: number,
  pauseMs: number
): Promise<{ jobs: BenchJob[]; abrufe: Abruf[]; abgebrochen: string | null }> {
  const jobs: BenchJob[] = [];
  const abrufe: Abruf[] = [];
  const ort = profil.rolle === "admin" ? "Hamburg" : profil.ort;
  for (const [i, begriff] of begriffe.entries()) {
    if (i > 0) await warte(pauseMs);
    const params = new URLSearchParams({ app_id: zugang.id, app_key: zugang.key, what: begriff, results_per_page: "50", max_days_old: String(tage), "content-type": "application/json" });
    if (ort) {
      params.set("where", ort);
      params.set("distance", String(profil.rolle === "admin" ? 25 : profil.umkreis));
    }
    try {
      const res = await fetch(`https://api.adzuna.com/v1/api/jobs/de/search/1?${params.toString()}`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) {
        abrufe.push({ quelle: "adzuna", profil: profil.id, suchbegriff: begriff, ok: false, anzeigen: 0, fehler: "Rate-Limit (429) — Abbruch ohne Wiederholung", kontingent: true, art: "suche" });
        return { jobs, abrufe, abgebrochen: "Rate-Limit" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      const body = (await res.json()) as { results?: any[] };
      const liste = body.results ?? [];
      abrufe.push({ quelle: "adzuna", profil: profil.id, suchbegriff: begriff, ok: true, anzeigen: liste.length, fehler: null, kontingent: true, art: "suche" });
      for (const j of liste) jobs.push(adzunaZuBench(j, profil, begriff));
    } catch (err) {
      abrufe.push({ quelle: "adzuna", profil: profil.id, suchbegriff: begriff, ok: false, anzeigen: 0, fehler: bereinige(String(err instanceof Error ? err.message : err)), kontingent: true, art: "suche" });
      return { jobs, abrufe, abgebrochen: "Fehler" };
    }
  }
  return { jobs, abrufe, abgebrochen: null };
}
