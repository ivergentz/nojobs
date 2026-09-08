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

  // Suche ist geklärt. Offen ist nur noch: wo steht die Stellenbeschreibung?
  // Die Trefferliste enthält sie nicht, das Bewertungs-Prompt braucht sie aber.
  const ref = url.searchParams.get("ref") ?? "10001-1003600753-S";
  const b64 = Buffer.from(ref, "utf8").toString("base64");
  const b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const candidates: Array<{ label: string; path: string; key: boolean }> = [
    { label: "detail-v4-roh", path: `/pc/v4/jobdetails/${encodeURIComponent(ref)}`, key: true },
    { label: "detail-v4-base64", path: `/pc/v4/jobdetails/${b64}`, key: true },
    { label: "detail-v4-base64url", path: `/pc/v4/jobdetails/${b64url}`, key: true },
    { label: "detail-v6-roh", path: `/pc/v6/jobdetails/${encodeURIComponent(ref)}`, key: true },
    { label: "detail-v6-base64url", path: `/pc/v6/jobdetails/${b64url}`, key: true },
    { label: "suche-mit-beschreibung", path: `/pc/v6/jobs?was=Product%20Owner&wo=Hamburg&size=1&page=1`, key: true },
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

        const entry = Object.entries(parsed).find(([, value]) => Array.isArray(value));
        const listKey = entry?.[0] ?? null;
        const list = (entry?.[1] as unknown[]) ?? null;
        const first = (list?.[0] ?? null) as Record<string, unknown> | null;

        // Bei Detailantworten ist das Wurzelobjekt selbst die Anzeige.
        const objekt = first ?? parsed;

        // Längstes Textfeld — das ist mit hoher Wahrscheinlichkeit die Beschreibung.
        let textfeld: string | null = null;
        let textlaenge = 0;
        for (const [key, value] of Object.entries(objekt)) {
          if (typeof value === "string" && value.length > textlaenge) {
            textlaenge = value.length;
            textfeld = key;
          }
        }

        return {
          label: candidate.label,
          status: res.status,
          wurzelfelder: Object.keys(parsed).slice(0, 15),
          listenfeld: listKey ?? null,
          anzahlAufSeite: list?.length ?? null,
          gesamt: parsed.maxErgebnisse ?? parsed.totalElements ?? parsed.total ?? null,
          felder: Object.keys(objekt).slice(0, 40),
          beschreibungsfeld: textfeld,
          beschreibungslaenge: textlaenge,
          beschreibungsanfang:
            textfeld && textlaenge > 200
              ? String((objekt as Record<string, unknown>)[textfeld]).slice(0, 400)
              : null,
          beispiel: JSON.stringify(objekt).slice(0, 1800),
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
