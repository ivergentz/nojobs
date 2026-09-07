import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED = ["must_apply", "worth_reading", "ignore"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { uuid?: string; label?: string | null };

    if (!body.uuid) {
      return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });
    }

    // null hebt ein Urteil wieder auf (Zurück-Taste).
    if (body.label !== null && !ALLOWED.includes(body.label ?? "")) {
      return NextResponse.json({ error: "unbekanntes Urteil" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { error } = await db
      .from("jobs")
      .update({
        label: body.label,
        labeled_at: body.label ? new Date().toISOString() : null,
      })
      .eq("uuid", body.uuid);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
