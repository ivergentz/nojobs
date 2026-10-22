import { NextResponse } from "next/server";
import { getNavToken, toRfc1123, NAV_BASE, type NavFeedPage } from "@/lib/nav";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnose, kein Produktionscode.
 *
 * Die NAV-Doku sagt, man könne den Feed an der ersten Seite, an der letzten
 * Seite oder über If-Modified-Since betreten — dokumentiert aber nur die
 * dritte Variante. Statt zu raten, probieren wir die Kandidaten durch und
 * berichten, wo jeder landet. Danach wissen wir, welcher Einstieg funktioniert.
 *
 * Diese Route kann nach der Analyse gelöscht werden.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const days = Number(url.searchParams.get("days") ?? process.env.NAV_BACKFILL_DAYS ?? "14");
  const since = toRfc1123(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  const candidates: Array<{ label: string; path: string; ifModifiedSince?: string }> = [
    { label: "if-modified-since", path: "/api/v1/feed", ifModifiedSince: since },
    { label: "erste-seite-ohne-header", path: "/api/v1/feed" },
    { label: "query-last-true", path: "/api/v1/feed?last=true" },
    { label: "pfad-last", path: "/api/v1/feed/last" },
    { label: "query-page-last", path: "/api/v1/feed?page=last" },
    { label: "query-size-1", path: "/api/v1/feed?size=1" },
  ];

  try {
    const token = await getNavToken();

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const headers: Record<string, string> = {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        };
        if (candidate.ifModifiedSince) headers["If-Modified-Since"] = candidate.ifModifiedSince;

        try {
          const res = await fetch(`${NAV_BASE}${candidate.path}`, {
            headers,
            cache: "no-store",
          });

          if (!res.ok) {
            return {
              label: candidate.label,
              path: candidate.path,
              status: res.status,
              body: (await res.text()).slice(0, 200),
            };
          }

          const page = (await res.json()) as NavFeedPage;
          const items = page.items ?? [];
          const active = items.filter(
            (item) => (item._feed_entry?.status ?? "").toUpperCase() === "ACTIVE"
          ).length;

          return {
            label: candidate.label,
            path: candidate.path,
            status: res.status,
            items: items.length,
            aktiv: active,
            erstesDatum: items[0]?.date_modified ?? null,
            letztesDatum: items[items.length - 1]?.date_modified ?? null,
            hatNextUrl: Boolean(page.next_url),
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

    return NextResponse.json({ ok: true, gesuchtAb: since, results }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
