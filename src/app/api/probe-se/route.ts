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
    { label: "snapshot", path: "/snapshot", withKey: false },
    { label: "wurzel", path: "/", withKey: false },
  ];

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.withKey && !apiKey) {
        return { label: candidate.label, uebersprungen: "JOBTECH_API_KEY nicht gesetzt" };
      }

      const headers: Record<string, string> = { Accept: "application/json" };
      if (candidate.withKey && apiKey) headers["api-key"] = apiKey;

      try {
        const res = await fetch(`${BASE}${candidate.path}`, { headers, cache: "no-store" });
        const text = await res.text();

        if (!res.ok) {
          return {
            label: candidate.label,
            path: candidate.path,
            status: res.status,
            body: text.slice(0, 250),
          };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return {
            label: candidate.label,
            path: candidate.path,
            status: res.status,
            hinweis: "kein JSON",
            body: text.slice(0, 250),
          };
        }

        const list = Array.isArray(parsed) ? parsed : null;
        const first = (list?.[0] ?? parsed) as Record<string, unknown>;

        return {
          label: candidate.label,
          path: candidate.path,
          status: res.status,
          istListe: Array.isArray(parsed),
          anzahl: list?.length ?? null,
          groesseKb: Math.round(text.length / 1024),
          // Das Wichtigste: die echten Feldnamen plus ein gekürztes Beispiel.
          felder: first && typeof first === "object" ? Object.keys(first) : null,
          beispiel: first ? JSON.stringify(first).slice(0, 2500) : null,
        };
      } catch (error) {
        return {
          label: candidate.label,
          path: candidate.path,
          fehler: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return NextResponse.json({ ok: true, gesuchtAb: since, results });
}
