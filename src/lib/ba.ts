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

/** Größte Seite, die die Suche ausliefert. */
export const BA_PAGE_SIZE = 100;

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

/** Eine Seite einer Suche. `tage` begrenzt auf Anzeigen der letzten N Tage. */
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
    size: String(options.size ?? BA_PAGE_SIZE),
    page: String(options.page ?? 1),
  });

  const res = await call(`/pc/v6/jobs?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`BA-Suche "${options.was}": HTTP ${res.status}`);
  }

  const body = (await res.json()) as { ergebnisliste?: BaHit[]; maxErgebnisse?: number };
  return { hits: body.ergebnisliste ?? [], gesamt: Number(body.maxErgebnisse ?? 0) };
}

/**
 * Alle Seiten einer Suche. Vorher wurde nur Seite 1 mit 50 Treffern gelesen —
 * bei bundesweiten Begriffen wie "Product Manager" fiel alles dahinter
 * lautlos weg. `maxSeiten` deckelt die Laufzeit.
 */
export async function searchBaAll(options: {
  was: string;
  tage: number;
  maxSeiten?: number;
}): Promise<{ hits: BaHit[]; gesamt: number; abgeschnitten: boolean }> {
  const maxSeiten = options.maxSeiten ?? 5;
  const first = await searchBa({ was: options.was, tage: options.tage, page: 1 });
  const hits = [...first.hits];
  const seiten = Math.min(maxSeiten, Math.ceil(first.gesamt / BA_PAGE_SIZE));

  // Restliche Seiten parallel — sequenziell kostet das bei 27 Begriffen zu viel Zeit.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, seiten - 1) }, (_, index) =>
      searchBa({ was: options.was, tage: options.tage, page: index + 2 })
        .then((result) => result.hits)
        .catch(() => [] as BaHit[])
    )
  );
  for (const page of rest) hits.push(...page);

  return { hits, gesamt: first.gesamt, abgeschnitten: first.gesamt > hits.length };
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

  try {
    const res = await call(`/pc/v4/jobdetails/${encoded}`);
    if (!res.ok) return null;
    return (await res.json()) as BaDetail;
  } catch {
    // Zeitüberschreitung oder Netzwerkfehler — wie "nicht gefunden" behandeln,
    // statt den ganzen Importlauf abzubrechen.
    return null;
  }
}

/** Link auf die Anzeige in der Jobbörse. */
export function baUrl(referenznummer: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(referenznummer)}`;
}
