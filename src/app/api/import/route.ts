import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { stageA, stageB } from "@/lib/filter";
import { normalizeAd } from "@/lib/normalize";
import {
  fetchAdDetail,
  fetchFeedPage,
  getNavToken,
  toRfc1123,
  type NavFeedItem,
} from "@/lib/nav";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wir hören deutlich vor dem Serverless-Limit auf und speichern den Cursor.
 * Der nächste Aufruf macht dort weiter. Dadurch ist der 14-Tage-Backfill
 * beliebig oft wiederholbar, ohne dass ein Abbruch etwas kaputt macht.
 */
const TIME_BUDGET_MS = 45_000;
const DETAIL_CONCURRENCY = 6;
const CURSOR_ID = "nav";

type Cursor = {
  id: string;
  cursor_url: string | null;
  etag: string | null;
  start_from: string | null;
  at_end: boolean;
  pages_done: number;
  items_seen: number;
};

async function loadCursor(db: ReturnType<typeof supabaseAdmin>): Promise<Cursor> {
  const { data, error } = await db
    .from("import_cursor")
    .select("*")
    .eq("id", CURSOR_ID)
    .maybeSingle();

  if (error) throw new Error(`Cursor lesen fehlgeschlagen: ${error.message}`);
  if (data) return data as Cursor;

  const days = Number(process.env.NAV_BACKFILL_DAYS ?? "14");
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const fresh: Cursor = {
    id: CURSOR_ID,
    cursor_url: null,
    etag: null,
    start_from: toRfc1123(from),
    at_end: false,
    pages_done: 0,
    items_seen: 0,
  };

  // Upsert statt insert: zwei parallele Aufrufe (Reload, Doppelklick,
  // Browser-Prefetch) würden sonst beide anlegen wollen und einer bricht
  // am Primary Key ab. ignoreDuplicates lässt eine vorhandene Zeile in Ruhe.
  const { error: upsertError } = await db
    .from("import_cursor")
    .upsert(fresh, { onConflict: "id", ignoreDuplicates: true });

  if (upsertError) throw new Error(`Cursor anlegen fehlgeschlagen: ${upsertError.message}`);

  const { data: created, error: rereadError } = await db
    .from("import_cursor")
    .select("*")
    .eq("id", CURSOR_ID)
    .maybeSingle();

  if (rereadError) throw new Error(`Cursor erneut lesen fehlgeschlagen: ${rereadError.message}`);

  if (!created) {
    throw new Error(
      "Cursor wurde geschrieben, ist aber nicht lesbar. Das passiert, wenn in " +
        "SUPABASE_SERVICE_ROLE_KEY der anon- bzw. publishable-Key steht — der sieht " +
        "wegen Row Level Security keine Zeilen. Bitte den service_role-Schlüssel eintragen."
    );
  }

  return created as Cursor;
}

async function inBatches<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;

  // Vercel-Cron schickt einen eigenen Header; im Browser reicht ?secret=
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = supabaseAdmin();

  const stats = {
    pages: 0,
    items: 0,
    droppedStageA: 0,
    droppedStageB: 0,
    detailsFetched: 0,
    detailsFailed: 0,
    kept: 0,
    deactivated: 0,
  };

  try {
    const token = await getNavToken();
    const cursor = await loadCursor(db);

    let cursorUrl = cursor.cursor_url ?? "/api/v1/feed";
    let etag = cursor.etag;
    let atEnd = cursor.at_end;
    let pagesDone = cursor.pages_done;
    let itemsSeen = cursor.items_seen;
    let note: string | null = null;

    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const result = await fetchFeedPage({
        token,
        path: cursorUrl,
        // If-Modified-Since positioniert nur den Einstiegspunkt beim allerersten Aufruf.
        ifModifiedSince: cursor.cursor_url === null && pagesDone === 0 ? cursor.start_from : null,
        // ETag nur beim Nachpollen der letzten Seite — sonst drohen falsche 304er.
        etag: atEnd ? etag : null,
      });

      if (result.kind === "not-modified") {
        note = "Keine neuen Einträge seit dem letzten Lauf.";
        break;
      }

      if (result.kind === "error") {
        note = `Feed antwortete mit HTTP ${result.status}: ${result.body}`;
        break;
      }

      const { page } = result;
      stats.pages += 1;
      pagesDone += 1;
      const items = page.items ?? [];
      stats.items += items.length;
      itemsSeen += items.length;

      // ---- Stufe A: entscheiden, ob wir das Detail überhaupt abrufen ----
      const survivors: NavFeedItem[] = [];
      const dropped: Record<string, unknown>[] = [];
      const deactivated: string[] = [];

      for (const item of items) {
        const verdict = stageA(item);
        if (verdict.keep) {
          survivors.push(item);
          continue;
        }

        stats.droppedStageA += 1;

        // Inaktive Anzeigen müssen laut Nutzungsbedingungen aus dem Dienst
        // verschwinden. Wir markieren sie; die Views zeigen nur ACTIVE.
        if (verdict.reason.startsWith("status:") && item._feed_entry?.uuid) {
          deactivated.push(item._feed_entry.uuid);
        }

        dropped.push({
          feed_entry_id: item.id,
          uuid: item._feed_entry?.uuid ?? null,
          title: item.title ?? item._feed_entry?.title ?? null,
          employer_name: item._feed_entry?.businessName ?? null,
          municipal: item._feed_entry?.municipal ?? null,
          status: item._feed_entry?.status ?? null,
          drop_stage: verdict.stage,
          drop_reason: verdict.reason,
          date_modified: item.date_modified ?? null,
        });
      }

      if (deactivated.length) {
        const { error } = await db
          .from("jobs")
          .update({ status: "INACTIVE" })
          .in("uuid", deactivated);
        if (!error) stats.deactivated += deactivated.length;
      }

      // ---- Stufe B: Detail holen, normalisieren, speichern ----
      const rows: ReturnType<typeof normalizeAd>[] = [];

      await inBatches(survivors, DETAIL_CONCURRENCY, async (item) => {
        const detail = await fetchAdDetail({ token, url: item.url });
        if (!detail) {
          stats.detailsFailed += 1;
          return;
        }
        stats.detailsFetched += 1;

        const verdict = stageB(detail.ad);
        if (!verdict.keep) {
          stats.droppedStageB += 1;
          dropped.push({
            feed_entry_id: item.id,
            uuid: item._feed_entry?.uuid ?? null,
            title: detail.ad.title ?? item.title ?? null,
            employer_name: detail.ad.employer?.name ?? null,
            municipal: item._feed_entry?.municipal ?? null,
            status: detail.status ?? item._feed_entry?.status ?? null,
            drop_stage: verdict.stage,
            drop_reason: verdict.reason,
            date_modified: item.date_modified ?? null,
          });
          return;
        }

        rows.push(normalizeAd({ item, ad: detail.ad, detailStatus: detail.status }));
      });

      if (dropped.length) {
        const { error } = await db
          .from("dropped_ads")
          .upsert(dropped, { onConflict: "feed_entry_id" });
        if (error) note = `Drop-Log konnte nicht geschrieben werden: ${error.message}`;
      }

      if (rows.length) {
        const { error } = await db.from("jobs").upsert(rows, { onConflict: "uuid" });
        if (error) {
          note = `Jobs konnten nicht geschrieben werden: ${error.message}`;
          break;
        }
        stats.kept += rows.length;
      }

      // ---- Cursor weiterschieben ----
      if (page.next_url) {
        cursorUrl = page.next_url;
        atEnd = false;
        etag = null;
      } else {
        // Ende des Feeds erreicht. Diese Seite beim nächsten Lauf erneut abfragen.
        atEnd = true;
        etag = result.etag;
        note = note ?? "Ende des Feeds erreicht.";
        break;
      }
    }

    const { error: saveError } = await db
      .from("import_cursor")
      .update({
        cursor_url: cursorUrl,
        etag,
        at_end: atEnd,
        pages_done: pagesDone,
        items_seen: itemsSeen,
        last_run_at: new Date().toISOString(),
        last_note: note,
      })
      .eq("id", CURSOR_ID);

    if (saveError) {
      return NextResponse.json(
        { ok: false, error: `Cursor speichern fehlgeschlagen: ${saveError.message}`, stats },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      done: atEnd,
      note,
      durationMs: Date.now() - startedAt,
      totals: { pagesDone, itemsSeen },
      thisRun: stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message, stats }, { status: 500 });
  }
}
