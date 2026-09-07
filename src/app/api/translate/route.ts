import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { translateAd } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Übersetzt eine Anzeige und legt das Ergebnis in der Datenbank ab.
 * Jede Anzeige wird also höchstens einmal bezahlt, egal wie oft sie
 * beim Labeln aufgerufen wird.
 */
export async function POST(request: Request) {
  try {
    const { uuid } = (await request.json()) as { uuid?: string };
    if (!uuid) {
      return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: job, error: readError } = await db
      .from("jobs")
      .select("uuid,title,description,title_de,description_de,salary_min_nok,salary_max_nok,salary_note,translated_at")
      .eq("uuid", uuid)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: "Stelle nicht gefunden" }, { status: 404 });
    }

    if (job.translated_at) {
      return NextResponse.json({
        cached: true,
        title_de: job.title_de,
        description_de: job.description_de,
        salary_min_nok: job.salary_min_nok,
        salary_max_nok: job.salary_max_nok,
        salary_note: job.salary_note,
      });
    }

    const result = await translateAd({
      title: (job.title as string) ?? "",
      description: (job.description as string) ?? "",
    });

    const { error: writeError } = await db
      .from("jobs")
      .update({
        title_de: result.title_de,
        description_de: result.description_de,
        salary_min_nok: result.salary_min_nok,
        salary_max_nok: result.salary_max_nok,
        salary_note: result.salary_note,
        translated_at: new Date().toISOString(),
      })
      .eq("uuid", uuid);

    if (writeError) {
      // Übersetzung ist da, nur das Speichern klemmt — trotzdem ausliefern.
      return NextResponse.json({ ...result, cached: false, warnung: writeError.message });
    }

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
