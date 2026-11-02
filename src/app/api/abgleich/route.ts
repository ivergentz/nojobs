import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ladeAbgleich } from "@/lib/abgleich";

export const dynamic = "force-dynamic";

/**
 * GET  → aktueller Abgleich jobs ↔ matches
 * POST → Abweichungen nachziehen: kopiert die betroffenen Stellen erneut aus
 *        jobs nach matches. Ändert jobs nie.
 */
export async function GET() {
  try {
    return NextResponse.json(await ladeAbgleich(supabaseAdmin()));
  } catch (error) {
    return NextResponse.json({ stand: "fehler", hinweis: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.rpc("matches_nachziehen");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ nachgezogen: Number(data ?? 0), abgleich: await ladeAbgleich(db) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
