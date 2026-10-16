import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Sichert den bearbeiteten Entwurf. Das PDF wird immer aus dem gesicherten Stand erzeugt. */
export async function POST(request: Request) {
  try {
    const { uuid, draft } = (await request.json()) as { uuid?: string; draft?: unknown };
    if (!uuid || !draft) return NextResponse.json({ error: "uuid oder draft fehlt" }, { status: 400 });

    const db = supabaseAdmin();

    // Die Formular-Fragen werden separat gepflegt (/api/application/frage) —
    // beim Sichern des Anschreibens nicht überschreiben.
    const { data: vorher } = await db.from("jobs").select("application_draft").eq("uuid", uuid).maybeSingle();
    const fragen = (vorher?.application_draft as any)?.fragen;
    const merged = fragen ? { ...(draft as Record<string, unknown>), fragen } : draft;

    const { error } = await db
      .from("jobs")
      .update({ application_draft: merged, application_drafted_at: new Date().toISOString() })
      .eq("uuid", uuid);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
