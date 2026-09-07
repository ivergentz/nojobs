/**
 * Client für JobStream (Arbetsförmedlingen).
 *
 * Zwei Unterschiede zu NAV, die die Architektur bestimmen:
 *
 * 1. Der Stream liefert die vollständige Anzeige. Kein Detailabruf nötig.
 * 2. Der Stream hat KEINE Paginierung. `/stream?date=X` gibt alle Änderungen
 *    seit X als ein einziges JSON-Array zurück — über 14 Tage sind das
 *    zweistellige Megabyte. Ein res.json() darauf sprengt die Funktion.
 *
 * Deshalb wird die Antwort im Strom geparst: Chunks lesen, vollständige
 * Objekte herausziehen, verarbeiten, verwerfen. Der Zeitstempel der zuletzt
 * verarbeiteten Anzeige ist der Cursor für den nächsten Lauf.
 */

export const JOBSTREAM_BASE = "https://jobstream.api.jobtechdev.se";

export type SeAd = {
  id?: string | number;
  headline?: string | null;
  webpage_url?: string | null;
  application_deadline?: string | null;
  description?: { text?: string | null; text_formatted?: string | null } | null;
  employer?: { name?: string | null; workplace?: string | null; url?: string | null } | null;
  application_details?: { url?: string | null; reference?: string | null } | null;
  employment_type?: { label?: string | null } | null;
  working_hours_type?: { label?: string | null } | null;
  scope_of_work?: { min?: number | null; max?: number | null } | null;
  salary_type?: { label?: string | null } | null;
  salary_description?: string | null;
  occupation?: { label?: string | null } | null;
  occupation_group?: { label?: string | null } | null;
  occupation_field?: { label?: string | null } | null;
  workplace_address?: {
    municipality?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
  publication_date?: string | null;
  last_publication_date?: string | null;
  removed?: boolean | null;
  removed_date?: string | null;
  identified_language?: string | null;
  timestamp?: number | null;
  [key: string]: unknown;
};

/** JobStream erwartet einen Zeitstempel ohne Zeitzone und ohne Millisekunden. */
export function toJobstreamDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/**
 * Öffnet den Stream und ruft `onAd` für jede vollständig gelesene Anzeige auf.
 * Gibt `false` zurück, sobald `shouldStop` greift — dann wird der Rest des
 * Bodys verworfen und die Verbindung geschlossen.
 */
export async function streamAds(options: {
  since: string;
  signal?: AbortSignal;
  shouldStop: () => boolean;
  onAd: (ad: SeAd) => Promise<void> | void;
}): Promise<{ count: number; abgebrochen: boolean; lastTimestamp: number | null }> {
  const res = await fetch(`${JOBSTREAM_BASE}/stream?date=${options.since}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`JobStream: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("JobStream lieferte keinen lesbaren Body.");

  const decoder = new TextDecoder();
  let buffer = "";
  let count = 0;
  let abgebrochen = false;
  let lastTimestamp: number | null = null;

  try {
    while (true) {
      if (options.shouldStop()) {
        abgebrochen = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Alle vollständigen Objekte aus dem Puffer ziehen, Rest stehen lassen.
      let consumed = 0;
      while (true) {
        const found = nextObject(buffer, consumed);
        if (!found) break;

        consumed = found.end;
        count += 1;
        if (typeof found.value.timestamp === "number") {
          lastTimestamp = found.value.timestamp;
        }
        await options.onAd(found.value);

        if (options.shouldStop()) {
          abgebrochen = true;
          break;
        }
      }

      buffer = buffer.slice(consumed);
      if (abgebrochen) break;

      // Sicherheitsnetz: sollte nie greifen, verhindert aber unbegrenztes
      // Wachsen, falls ein Objekt unerwartet riesig ist.
      if (buffer.length > 5_000_000) {
        throw new Error("Puffer überschritt 5 MB ohne vollständiges Objekt.");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return { count, abgebrochen, lastTimestamp };
}

/**
 * Sucht ab `from` das nächste vollständige JSON-Objekt per Klammerzählung.
 * Anführungszeichen und Escapes werden berücksichtigt, damit geschweifte
 * Klammern im Anzeigentext nicht mitzählen.
 */
function nextObject(
  text: string,
  from: number
): { value: SeAd; end: number } | null {
  const start = text.indexOf("{", from);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return { value: JSON.parse(text.slice(start, i + 1)) as SeAd, end: i + 1 };
        } catch {
          // Unvollständig oder kaputt — beim nächsten Chunk erneut versuchen.
          return null;
        }
      }
    }
  }

  return null;
}
