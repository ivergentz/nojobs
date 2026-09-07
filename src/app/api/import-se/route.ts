import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { streamAds, toJobstreamDate, type SeAd } from "@/lib/jobstream";
import { filterSe, normalizeSe } from "@/lib/normalize-se";
import type { JobRow } from "@/lib/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 40_000;
const FLUSH_AT = 200;
const CURSOR_ID = "se";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = supabaseAdmin();
  const stats = { gelesen: 0, verworfen: 0, gespeichert: 0, deaktiviert: 0 };
  const reasonTally: Record<string, number> = {};

  try {
    if (url.searchParams.get("reset")) {
      if (url.searchParams.get("reset") === "purge") {
        await db.from("jobs").delete().eq("source", "jobstream");
        await db.from("dropped_ads").delete().eq("drop_stage", "SE");
      }
      await db.from("import_cursor").delete().eq("id", CURSOR_ID);
      return NextResponse.json({ ok: true, reset: "Cursor zurückgesetzt." });
    }

    const { data: cursor } = await db
      .from("import_cursor")
      .select("*")
      .eq("id", CURSOR_ID)
      .maybeSingle();

    const days = Number(process.env.SE_BACKFILL_DAYS ?? process.env.NAV_BACKFILL_DAYS ?? "14");
    const since =
      (cursor?.start_from as string | null) ??
      toJobstreamDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

    const rows: JobRow[] = [];
    const dropped: Record<string, unknown>[] = [];
    const deactivate: string[] = [];

    const flush = async () => {
      if (rows.length) {
        const unique = Array.from(new Map(rows.map((row) => [row.uuid, row])).values());
        const { error } = await db.from("jobs").upsert(unique, { onConflict: "uuid" });
        if (error) throw new Error(`Jobs schreiben: ${error.message}`);
        stats.gespeichert += unique.length;
        rows.length = 0;
      }
      if (dropped.length) {
        const unique = Array.from(
          new Map(dropped.map((row) => [row.feed_entry_id as string, row])).values()
        );
        await db.from("dropped_ads").upsert(unique, { onConflict: "feed_entry_id" });
        dropped.length = 0;
      }
      if (deactivate.length) {
        for (let i = 0; i < deactivate.length; i += 200) {
          const chunk = Array.from(new Set(deactivate.slice(i, i + 200)));
          await db.from("jobs").update({ status: "INACTIVE" }).in("uuid", chunk);
          stats.deaktiviert += chunk.length;
        }
        deactivate.length = 0;
      }
    };

    const result = await streamAds({
      since,
      shouldStop: () => Date.now() - startedAt > TIME_BUDGET_MS,
      onAd: async (ad: SeAd) => {
        stats.gelesen += 1;
        const verdict = filterSe(ad);

        if (verdict.keep) {
          rows.push(normalizeSe(ad, verdict.matched));
        } else {
          stats.verworfen += 1;
          const key = verdict.reason.split(":")[0];
          reasonTally[key] = (reasonTally[key] ?? 0) + 1;

          if (verdict.reason === "status:removed" && ad.id) {
            deactivate.push(`se-${String(ad.id)}`);
          }

          dropped.push({
            feed_entry_id: `se-${String(ad.id ?? Math.random())}`,
            uuid: ad.id ? `se-${String(ad.id)}` : null,
            title: ad.headline ?? null,
            employer_name: ad.employer?.name ?? null,
            municipal: ad.workplace_address?.municipality ?? null,
            status: ad.removed ? "REMOVED" : "ACTIVE",
            drop_stage: "SE",
            drop_reason: verdict.reason,
            date_modified: ad.publication_date ?? null,
          });
        }

        if (rows.length + dropped.length >= FLUSH_AT) await flush();
      },
    });

    await flush();

    // Cursor: der Zeitstempel der zuletzt verarbeiteten Anzeige. Eine Minute
    // Überlappung, damit an der Schnittstelle nichts verlorengeht.
    const nextSince = result.lastTimestamp
      ? toJobstreamDate(new Date(result.lastTimestamp - 60_000))
      : since;

    await db.from("import_cursor").upsert(
      {
        id: CURSOR_ID,
        start_from: nextSince,
        at_end: !result.abgebrochen,
        items_seen: (cursor?.items_seen ?? 0) + stats.gelesen,
        pages_done: (cursor?.pages_done ?? 0) + 1,
        last_item_date: result.lastTimestamp ? new Date(result.lastTimestamp).toISOString() : null,
        last_run_at: new Date().toISOString(),
        last_note: result.abgebrochen ? "Zeitbudget erreicht, weiterlaufen lassen." : "Stream zu Ende gelesen.",
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      ok: true,
      done: !result.abgebrochen,
      gelesenAb: since,
      naechsterStart: nextSince,
      durationMs: Date.now() - startedAt,
      ...stats,
      gruende: reasonTally,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
