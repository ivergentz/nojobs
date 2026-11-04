/**
 * Adzuna Jobsuche (Deutschland) — offizielle API mit freiem Schlüssel.
 * Bedingungen: Stellen aus Adzuna mit Hinweis „Jobs by Adzuna“ und Link anzeigen; bei Monetarisierung Lizenz nötig.
 * Standardgrenzen laut Doku/Konto: 25 Aufrufe pro Minute, 250 pro Tag, 2.500 pro Monat.
 */

export type AdzunaJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string | null;
  published: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryGeschaetzt: boolean;
};

export function adzunaAn(): boolean {
  return Boolean((process.env.ADZUNA_APP_ID ?? "").trim() && (process.env.ADZUNA_APP_KEY ?? "").trim());
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

export function adzunaZuJob(j: Record<string, any>): AdzunaJob | null {
  if (j?.id === undefined || j?.id === null) return null;
  const min = Number(j.salary_min);
  const max = Number(j.salary_max);
  return {
    id: String(j.id),
    title: text(j.title),
    company: text(j.company?.display_name),
    location: text(j.location?.display_name),
    description: text(j.description),
    url: typeof j.redirect_url === "string" ? j.redirect_url : null,
    published: j.created ? new Date(j.created).toISOString() : null,
    salaryMin: Number.isFinite(min) ? Math.round(min) : null,
    salaryMax: Number.isFinite(max) ? Math.round(max) : null,
    salaryGeschaetzt: String(j.salary_is_predicted) === "1",
  };
}

/** Eine Suche, eine Seite (bis 50 Treffer). Fehler werfen — keine automatische Wiederholung. */
export async function adzunaSuche(suche: { was: string; wo: string; umkreis: number; tage: number }): Promise<AdzunaJob[]> {
  const params = new URLSearchParams({
    app_id: (process.env.ADZUNA_APP_ID ?? "").trim(),
    app_key: (process.env.ADZUNA_APP_KEY ?? "").trim(),
    what: suche.was,
    where: suche.wo,
    distance: String(suche.umkreis),
    max_days_old: String(suche.tage),
    results_per_page: "50",
    "content-type": "application/json",
  });
  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/de/search/1?${params.toString()}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(res.status === 429 ? "Adzuna: Rate-Limit erreicht (429)" : `Adzuna: HTTP ${res.status}`);
  const body = (await res.json()) as { results?: unknown[] };
  return (body.results ?? []).map((j) => adzunaZuJob(j as Record<string, any>)).filter((j): j is AdzunaJob => j !== null && Boolean(j.title));
}

/** Rotiert täglich durch die Begriffe: jeden Tag `anzahl` andere, nach wenigen Tagen ist jeder einmal dran. */
export function begriffeFuerHeute(begriffe: string[], anzahl: number, tag = Math.floor(Date.now() / 864e5)): string[] {
  if (begriffe.length <= anzahl) return [...begriffe];
  const start = (tag * anzahl) % begriffe.length;
  return Array.from({ length: anzahl }, (_, i) => begriffe[(start + i) % begriffe.length]);
}
