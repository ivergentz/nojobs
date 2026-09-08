import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Diagnose für die Jobsuche der Bundesagentur für Arbeit.
 *
 * Anders als NAV und JobStream gibt es hier keinen Feed, nur eine Suche mit
 * Paginierung. Zu klären ist: welche Endpunkt-Version antwortet, ob der
 * bekannte App-Schlüssel nötig ist, wie die Parameter für Ort, Umkreis und
 * Homeoffice heißen, und wie die Felder einer Anzeige benannt sind.
 *
 * Kann nach der Analyse gelöscht werden.
 */

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";

// Öffentlich bekannter Schlüssel der Jobsuche-App. Kein Geheimnis, aber wir
// prüfen, ob er überhaupt verlangt wird.
const APP_KEY = process.env.BA_API_KEY ?? "jobboerse-jobsuche";

const CALL_TIMEOUT_MS = 8_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const was = url.searchParams.get("was") ?? "Product Owner";
  const wo = url.searchParams.get("wo") ?? "Hamburg";
  const query = `was=${encodeURIComponent(was)}&wo=${encodeURIComponent(wo)}&umkreis=50&size=10&page=1`;

  const candidates: Array<{ label: string; path: string; key: boolean }> = [
    { label: "v4-mit-key", path: `/pc/v4/jobs?${query}`, key: true },
    { label: "v4-ohne-key", path: `/pc/v4/jobs?${query}`, key: false },
    { label: "v6-mit-key", path: `/pc/v6/jobs?${query}`, key: true },
    { label: "v5-mit-key", path: `/pc/v5/jobs?${query}`, key: true },
    // Homeoffice-Filter separat prüfen — der Parametername ist ungewiss.
    { label: "v4-homeoffice", path: `/pc/v4/jobs?was=${encodeURIComponent(was)}&arbeitszeit=ho&size=10&page=1`, key: true },
  ];

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (candidate.key) headers["X-API-Key"] = APP_KEY;

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);

      try {
        const res = await fetch(`${BASE}${candidate.path}`, {
          headers,
          cache: "no-store",
          signal: abort.signal,
        });
        const text = await res.text();

        if (!res.ok) {
          return {
            label: candidate.label,
            status: res.status,
            body: text.slice(0, 250),
          };
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return { label: candidate.label, status: res.status, hinweis: "kein JSON", body: text.slice(0, 250) };
        }

        // Die Trefferliste steckt je nach Version unter einem anderen Schlüssel.
        const listKey = ["stellenangebote", "jobs", "items", "content"].find(
          (key) => Array.isArray((parsed as Record<string, unknown>)[key])
        );
        const list = listKey ? ((parsed as Record<string, unknown>)[listKey] as unknown[]) : null;
        const first = (list?.[0] ?? null) as Record<string, unknown> | null;

        return {
          label: candidate.label,
          status: res.status,
          wurzelfelder: Object.keys(parsed).slice(0, 15),
          listenfeld: listKey ?? null,
          anzahlAufSeite: list?.length ?? null,
          gesamt: parsed.maxErgebnisse ?? parsed.totalElements ?? parsed.total ?? null,
          felder: first ? Object.keys(first) : null,
          beispiel: first ? JSON.stringify(first).slice(0, 2000) : null,
        };
      } catch (error) {
        return {
          label: candidate.label,
          fehler:
            error instanceof Error && error.name === "AbortError"
              ? `Zeitüberschreitung nach ${CALL_TIMEOUT_MS / 1000}s`
              : error instanceof Error
                ? error.message
                : String(error),
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return NextResponse.json({ ok: true, gesucht: { was, wo }, results });
}
