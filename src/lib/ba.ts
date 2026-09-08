/**
 * Client für die Jobsuche der Bundesagentur für Arbeit.
 *
 * Zwei Eigenheiten, beide gemessen statt geraten:
 *   - Suche läuft über v6, Detail über v4. v6-Details antworten mit 403.
 *   - Die Trefferliste enthält KEINE Stellenbeschreibung. Die steht nur im
 *     Detail unter `stellenangebotsBeschreibung`, adressiert über die
 *     base64-kodierte Referenznummer.
 *
 * Die Schnittstelle ist nicht offiziell dokumentiert. Für den Eigenbedarf in
 * Ordnung, als Grundlage eines Produkts nicht.
 */

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const APP_KEY = process.env.BA_API_KEY ?? "jobboerse-jobsuche";
const CALL_TIMEOUT_MS = 12_000;

export type BaHit = {
  stellenangebotsTitel?: string | null;
  hauptberuf?: string | null;
  alleBerufe?: string[] | null;
  firma?: string | null;
  referenznummer?: string | null;
  externeUrl?: string | null;
  homeofficemoeglich?: boolean | null;
  homeofficetyp?: string | null;
  homeofficeprozent?: number | null;
  arbeitszeitVollzeit?: boolean | null;
  vertragsdauer?: string | null;
  verguetungsangabe?: string | null;
  gehaltsspanneVon?: number | null;
  gehaltsspanneBis?: number | null;
  datumErsteVeroeffentlichung?: string | null;
  aenderungsdatum?: string | null;
  eintrittszeitraum?: { von?: string | null } | null;
  stellenlokationen?: Array<{
    adresse?: {
      ort?: string | null;
      region?: string | null;
      land?: string | null;
      plz?: string | null;
    } | null;
  }> | null;
  [key: string]: unknown;
};

export type BaDetail = BaHit & {
  stellenangebotsBeschreibung?: string | null;
  arbeitgeber?: string | null;
  branche?: string | null;
};

async function call(path: string): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", "X-API-Key": APP_KEY },
      cache: "no-store",
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Eine Suche. `veroeffentlichtseit` begrenzt auf frische Anzeigen. */
export async function searchBa(options: {
  was: string;
  tage: number;
  size?: number;
  page?: number;
}): Promise<{ hits: BaHit[]; gesamt: number }> {
  const params = new URLSearchParams({
    was: options.was,
    veroeffentlichtseit: String(options.tage),
    // 1 = reguläre Stellenangebote. Schließt Zeitarbeit und Ausbildung aus.
    angebotsart: "1",
    size: String(options.size ?? 50),
    page: String(options.page ?? 1),
  });

  const res = await call(`/pc/v6/jobs?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`BA-Suche "${options.was}": HTTP ${res.status}`);
  }

  const body = (await res.json()) as { ergebnisliste?: BaHit[]; maxErgebnisse?: number };
  return { hits: body.ergebnisliste ?? [], gesamt: body.maxErgebnisse ?? 0 };
}

/**
 * Detail einer Anzeige. Die Referenznummer wird base64-kodiert; die
 * URL-sichere Variante funktioniert ebenfalls und ist bei Sonderzeichen
 * die verlässlichere.
 */
export async function fetchBaDetail(referenznummer: string): Promise<BaDetail | null> {
  const encoded = Buffer.from(referenznummer, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await call(`/pc/v4/jobdetails/${encoded}`);
  if (!res.ok) return null;

  return (await res.json()) as BaDetail;
}

/** Link auf die Anzeige in der Jobbörse. */
export function baUrl(referenznummer: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(referenznummer)}`;
}
