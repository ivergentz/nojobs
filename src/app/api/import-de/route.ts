import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchBaDetail, searchBa } from "@/lib/ba";
import { filterDe, gehaltDe, normalizeDe, SUCHBEGRIFFE } from "@/lib/normalize-de";
import type { JobRow } from "@/lib/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 40_000;
const DETAIL_CONCURRENCY = 5;
const CURSOR_ID = "de";

/**
 * Arbeitet die Suchbegriffe der Reihe nach ab. Der Cursor merkt sich den
 * Index — jeder Aufruf macht beim nächsten Begriff weiter. Ist die Liste
 * durch, beginnt sie von vorn: bei einer Suche gibt es keinen Änderungsstrom,
 * also fragen wir regelmäßig neu.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = supabaseAdmin();
  const tage = Number(url.searchParams.get("tage") ?? "14");
  const stats = { begriffe: 0, treffer: 0, verworfen: 0, details: 0, gespeichert: 0 };
  const gruende: Record<string, number> = {};

  try {
    if (url.searchParams.get("reset")) {
      if (url.searchParams.get("reset") === "purge") {
        await db.from("jobs").delete().eq("source", "ba");
        await db.from("dropped_ads").delete().eq("drop_stage", "DE");
      }
      await db.from("import_cursor").delete().eq("id", CURSOR_ID);
      return NextResponse.json({ ok: true, reset: "Cursor zurückgesetzt." });
    }

    const { data: cursor } = await db
      .from("import_cursor")
      .select("*")
      .eq("id", CURSOR_ID)
      .maybeSingle();

    let index = (cursor?.pages_done as number) ?? 0;
    if (index >= SUCHBEGRIFFE.length) index = 0;

    const rows: JobRow[] = [];
    const dropped: Record<string, unknown>[] = [];

    while (index < SUCHBEGRIFFE.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const begriff = SUCHBEGRIFFE[index];
      stats.begriffe += 1;

      const { hits } = await searchBa({ was: begriff, tage });
      stats.treffer += hits.length;

      const survivors: Array<{ hit: (typeof hits)[number]; matched: string }> = [];

      for (const hit of hits) {
        const verdict = filterDe(hit, begriff);
        if (verdict.keep) {
          survivors.push({ hit, matched: verdict.matched });
          continue;
        }
        stats.verworfen += 1;
        const key = verdict.reason.split(":")[0];
        gruende[key] = (gruende[key] ?? 0) + 1;

        dropped.push({
          feed_entry_id: `de-${hit.referenznummer ?? Math.random()}`,
          uuid: hit.referenznummer ? `de-${hit.referenznummer}` : null,
          title: hit.stellenangebotsTitel ?? null,
          employer_name: hit.firma ?? null,
          municipal: hit.stellenlokationen?.[0]?.adresse?.ort ?? null,
          status: "ACTIVE",
          drop_stage: "DE",
          drop_reason: verdict.reason,
          date_modified: hit.datumErsteVeroeffentlichung ?? null,
        });
      }

      // Beschreibung gibt es nur im Detail — ohne sie kann das Modell nicht urteilen.
      for (let i = 0; i < survivors.length; i += DETAIL_CONCURRENCY) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        await Promise.all(
          survivors.slice(i, i + DETAIL_CONCURRENCY).map(async ({ hit, matched }) => {
            const ref = hit.referenznummer;
            if (!ref) return;
            const detail = await fetchBaDetail(ref);
            if (detail) stats.details += 1;

            const row = normalizeDe(hit, detail, matched);
            const gehalt = gehaltDe(hit);
            rows.push({
              ...row,
              // Euro-Beträge. Die Spaltennamen stammen aus dem NAV-Import;
              // die Anzeige unterscheidet nach `source`.
              salary_min_nok: gehalt.min,
              salary_max_nok: gehalt.max,
              salary_note: gehalt.note,
            } as JobRow & Record<string, unknown>);
          })
        );
      }

      index += 1;
    }

    if (dropped.length) {
      const unique = Array.from(
        new Map(dropped.map((row) => [row.feed_entry_id as string, row])).values()
      );
      await db.from("dropped_ads").upsert(unique, { onConflict: "feed_entry_id" });
    }

    if (rows.length) {
      const unique = Array.from(new Map(rows.map((row) => [row.uuid, row])).values());
      const { error } = await db.from("jobs").upsert(unique, { onConflict: "uuid" });
      if (error) throw new Error(`Jobs schreiben: ${error.message}`);
      stats.gespeichert = unique.length;
    }

    const durch = index >= SUCHBEGRIFFE.length;

    await db.from("import_cursor").upsert(
      {
        id: CURSOR_ID,
        pages_done: durch ? 0 : index,
        items_seen: ((cursor?.items_seen as number) ?? 0) + stats.treffer,
        at_end: durch,
        last_run_at: new Date().toISOString(),
        last_note: durch
          ? "Alle Suchbegriffe durch."
          : `Weiter bei "${SUCHBEGRIFFE[index]}" (${index + 1}/${SUCHBEGRIFFE.length}).`,
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      ok: true,
      done: durch,
      naechsterBegriff: durch ? null : SUCHBEGRIFFE[index],
      fortschritt: `${index}/${SUCHBEGRIFFE.length}`,
      durationMs: Date.now() - startedAt,
      ...stats,
      gruende,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
