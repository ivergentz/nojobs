import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Räumt die Inbox auf. Zwei Regeln:
 *
 *  1. Bewerbungsfrist abgelaufen — dann ist die Stelle objektiv erledigt.
 *  2. Seit 14 Tagen unangetastet auf "neu".
 *
 * Beide setzen den Status auf "abgelaufen" statt zu löschen. Die Stellen
 * verschwinden aus der Inbox, bleiben aber auffindbar — sonst wäre es
 * genau der stille Verlust, gegen den der Rest des Systems gebaut ist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const days = Number(url.searchParams.get("days") ?? "14");
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const heute = new Date().toISOString().slice(0, 10);

  try {
    const db = supabaseAdmin();

    const { data: abgelaufen, error: fristError } = await db
      .from("jobs")
      .update({ app_status: "abgelaufen", app_status_at: new Date().toISOString() })
      .eq("app_status", "neu")
      .not("application_due", "is", null)
      .lt("application_due", heute)
      .select("uuid");

    if (fristError) return NextResponse.json({ ok: false, error: fristError.message }, { status: 500 });

    // Gemessen wird am Veröffentlichungsdatum, nicht am Import. Deutsche
    // Anzeigen werden täglich neu importiert; ihr imported_at ist deshalb
    // immer frisch und wäre als Alterungsmaß unbrauchbar.
    const { data: liegengeblieben, error: altError } = await db
      .from("jobs")
      .update({ app_status: "abgelaufen", app_status_at: new Date().toISOString() })
      .eq("app_status", "neu")
      .not("published", "is", null)
      .lt("published", cutoff)
      .select("uuid");

    if (altError) return NextResponse.json({ ok: false, error: altError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      fristAbgelaufen: abgelaufen?.length ?? 0,
      liegengeblieben: liegengeblieben?.length ?? 0,
      tage: days,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
