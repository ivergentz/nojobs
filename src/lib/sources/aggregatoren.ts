import { createHash } from "crypto";
import { clean, fetchWithTimeout, htmlToText, toIso } from "./text";

/**
 * Zwei Sammelquellen zusätzlich zur Arbeitsagentur und den Firmen-Feeds.
 *
 * GOOGLE JOBS über SerpApi
 *   Google for Jobs indexiert StepStone, LinkedIn, Indeed, XING und
 *   Karriereseiten. Das ist der einzige praktikable, nicht AGB-widrige Weg,
 *   an diese Anzeigen zu kommen — StepStone, LinkedIn und Indeed selbst
 *   haben keine offene Such-API und verbieten Scraping.
 *   Kostenlos bis 250 Suchen im Monat. Wir machen 6 pro Tag (≈ 180/Monat).
 *   Aktiv nur, wenn die Umgebungsvariable SERPAPI_KEY gesetzt ist.
 *   Doku: https://serpapi.com/google-jobs-api
 *
 * ARBEITNOW
 *   Kostenlose Jobbörse für Deutschland mit offener API, ohne Schlüssel,
 *   mit voller Beschreibung. Kleiner Bestand, eher englischsprachige Stellen.
 *   Doku: https://arbeitnow.com/blog/job-board-api/
 */

export type SammelJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  description: string;
  url: string | null;
  published: string | null;
  via: string | null;
};

const kurz = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);

// ------------------------------------------------------------- Google Jobs

export const GOOGLE_SUCHEN: Array<{ q: string; location: string }> = [
  { q: "AI Product Manager", location: "Hamburg, Germany" },
  { q: "Product Owner KI", location: "Hamburg, Germany" },
  { q: "Product Manager", location: "Hamburg, Germany" },
  { q: "KI Manager", location: "Hamburg, Germany" },
  { q: "AI Program Manager", location: "Hamburg, Germany" },
  { q: "AI Product Manager remote", location: "Germany" },
];

/** "vor 3 Tagen" / "3 days ago" → ungefähres Datum. */
function postedAt(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const match = text.match(/(\d+)\s*(stunde|hour|tag|day|woche|week|monat|month)/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const tage = unit.startsWith("stunde") || unit.startsWith("hour") ? 0 : unit.startsWith("tag") || unit.startsWith("day") ? n : unit.startsWith("woche") || unit.startsWith("week") ? n * 7 : n * 30;
  return new Date(Date.now() - tage * 864e5).toISOString();
}

export async function googleJobs(suche: { q: string; location: string }): Promise<SammelJob[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    engine: "google_jobs",
    q: suche.q,
    location: suche.location,
    gl: "de",
    hl: "de",
    api_key: key,
  });
  const res = await fetchWithTimeout(`https://serpapi.com/search.json?${params.toString()}`, {}, 15_000);
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const body = (await res.json()) as { jobs_results?: any[]; error?: string };
  if (body.error && !/hasn't returned any results/i.test(body.error)) throw new Error(`SerpApi: ${body.error}`);

  return (body.jobs_results ?? []).map((job) => {
    const ext = job.detected_extensions ?? {};
    const apply = (job.apply_options ?? []) as Array<{ title?: string; link?: string }>;
    // Direkte Bewerbung beim Arbeitgeber bevorzugen, sonst den ersten Link.
    const direkt =
      apply.find((option) => !/linkedin|indeed|stepstone|xing|glassdoor|jooble|kimeta|jobware/i.test(option.title ?? "")) ??
      apply[0];
    const location = clean(job.location) ?? "";
    return {
      id: kurz(String(job.job_id ?? `${job.company_name}|${job.title}`)),
      title: clean(job.title) ?? "",
      company: clean(job.company_name) ?? "",
      location,
      remote: ext.work_from_home === true || /remote|homeoffice/i.test(location) ? true : null,
      description: clean(job.description) ?? "",
      url: clean(direkt?.link) ?? clean(job.share_link),
      published: postedAt(ext.posted_at),
      via: clean(job.via),
    };
  });
}

// --------------------------------------------------------------- Arbeitnow

export async function arbeitnow(seiten = 5): Promise<SammelJob[]> {
  const jobs: SammelJob[] = [];
  for (let page = 1; page <= seiten; page += 1) {
    const res = await fetchWithTimeout(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
    const body = (await res.json()) as { data?: any[]; links?: { next?: string | null } };
    for (const job of body.data ?? []) {
      jobs.push({
        id: String(job.slug ?? kurz(String(job.url))),
        title: clean(job.title) ?? "",
        company: clean(job.company_name) ?? "",
        location: clean(job.location) ?? "",
        remote: job.remote === true ? true : null,
        description: htmlToText(job.description),
        url: clean(job.url),
        published: toIso(job.created_at),
        via: "Arbeitnow",
      });
    }
    if (!body.links?.next || (body.data ?? []).length === 0) break;
  }
  return jobs;
}
