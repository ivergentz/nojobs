import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnose für JobStream (Arbetsförmedlingen), analog zur NAV-Probe.
 *
 * Zu klären ist dreierlei:
 *   1. Welcher Endpunkt liefert Änderungen ab einem Zeitpunkt?
 *   2. Braucht er einen API-Key?
 *   3. Wie heißen die Felder einer Anzeige?
 *
 * Punkt 3 ist der eigentliche Grund für diese Route: Ohne die echten
 * Feldnamen schreibe ich ein Mapping auf Verdacht, und das kostet wieder
 * drei Runden.
 *
 * Kann nach der Analyse gelöscht werden.
 */

const BASE = "https://jobstream.api.jobtechdev.se";

const BYTE_CAP = 300_000;
const CALL_TIMEOUT_MS = 8_000;

/**
 * Liest höchstens BYTE_CAP Bytes und bricht dann ab.
 *
 * /snapshot liefert alle aktuellen Anzeigen Schwedens am Stück — dreistellige
 * Megabyte. Ein vollständiges res.text() sprengt die Serverless-Funktion.
 * Für eine Feldanalyse genügen die ersten Kilobyte.
 */
async function readCapped(res: Response): Promise<{ text: string; abgeschnitten: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: "", abgeschnitten: false };

  const decoder = new TextDecoder();
  let text = "";
  let abgeschnitten = false;

  while (text.length < BYTE_CAP) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length >= BYTE_CAP) {
      abgeschnitten = true;
      break;
    }
  }

  await reader.cancel().catch(() => {});
  return { text, abgeschnitten };
}

/**
 * Holt das erste vollständige JSON-Objekt aus einem womöglich abgeschnittenen
 * Text, per Klammerzählung. Damit bekommen wir die Feldnamen auch dann, wenn
 * die Antwort nie zu Ende gelesen wurde.
 */
function firstObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
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
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}


export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  // JobStream erwartet einen Zeitstempel ohne Zeitzone.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const apiKey = process.env.JOBTECH_API_KEY;

  const candidates: Array<{ label: string; path: string; withKey: boolean }> = [
    { label: "stream-ohne-key", path: `/stream?date=${since}`, withKey: false },
    { label: "stream-mit-key", path: `/stream?date=${since}`, withKey: true },
    { label: "stream-slash-datum", path: `/stream/${since}`, withKey: false },
    { label: "wurzel", path: "/", withKey: false },
  ];

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.withKey && !apiKey) {
        return { label: candidate.label, uebersprungen: "JOBTECH_API_KEY nicht gesetzt" };
      }

      const headers: Record<string, string> = { Accept: "application/json" };
      if (candidate.withKey && apiKey) headers["api-key"] = apiKey;

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);

      try {
        const res = await fetch(`${BASE}${candidate.path}`, {
          headers,
          cache: "no-store",
          signal: abort.signal,
        });

        const { text, abgeschnitten } = await readCapped(res);

        if (!res.ok) {
          return {
            label: candidate.label,
            path: candidate.path,
            status: res.status,
            body: text.slice(0, 250),
          };
        }

        const sample = firstObject(text);

        return {
          label: candidate.label,
          path: candidate.path,
          status: res.status,
          istListe: text.trimStart().startsWith("["),
          gelesenKb: Math.round(text.length / 1024),
          abgeschnitten,
          felder: sample ? Object.keys(sample) : null,
          beispiel: sample ? JSON.stringify(sample).slice(0, 2500) : text.slice(0, 300),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          label: candidate.label,
          path: candidate.path,
          fehler: error instanceof Error && error.name === "AbortError"
            ? `Zeitüberschreitung nach ${CALL_TIMEOUT_MS / 1000}s`
            : message,
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return NextResponse.json({ ok: true, gesuchtAb: since, results });
}
