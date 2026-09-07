import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED = ["neu", "interessant", "beworben", "interview", "absage", "abgelegt"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { uuid?: string; status?: string; note?: string };

    if (!body.uuid || !ALLOWED.includes(body.status ?? "")) {
      return NextResponse.json({ error: "uuid oder status fehlt" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { error } = await db
      .from("jobs")
      .update({
        app_status: body.status,
        app_status_at: new Date().toISOString(),
        ...(body.note !== undefined ? { app_note: body.note } : {}),
      })
      .eq("uuid", body.uuid);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
