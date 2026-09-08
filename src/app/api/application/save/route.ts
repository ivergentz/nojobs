import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Sichert den bearbeiteten Entwurf. Das PDF wird immer aus dem gesicherten Stand erzeugt. */
export async function POST(request: Request) {
  try {
    const { uuid, draft } = (await request.json()) as { uuid?: string; draft?: unknown };
    if (!uuid || !draft) return NextResponse.json({ error: "uuid oder draft fehlt" }, { status: 400 });

    const db = supabaseAdmin();
    const { error } = await db
      .from("jobs")
      .update({ application_draft: draft, application_drafted_at: new Date().toISOString() })
      .eq("uuid", uuid);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
