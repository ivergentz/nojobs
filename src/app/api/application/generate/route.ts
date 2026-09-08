import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { draftApplication } from "@/lib/application";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { uuid, lang } = (await request.json()) as { uuid?: string; lang?: "de" | "en" };
    if (!uuid) return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });

    const db = supabaseAdmin();
    const { data: job, error } = await db
      .from("jobs")
      .select("uuid,source,title,title_de,employer_name,municipal,county,country,description")
      .eq("uuid", uuid)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Stelle nicht gefunden" }, { status: 404 });

    // Norwegische und schwedische Ausschreibungen werden auf Englisch beantwortet.
    const sprache = lang ?? (job.source === "ba" ? "de" : "en");

    const draft = await draftApplication({
      lang: sprache,
      title: (job.title as string) ?? "",
      employer: (job.employer_name as string) ?? "",
      place:
        [job.municipal, job.county].filter(Boolean).join(", ") ||
        ((job.country as string) ?? ""),
      description: (job.description as string) ?? "",
    });

    const { error: writeError } = await db
      .from("jobs")
      .update({ application_draft: draft, application_drafted_at: new Date().toISOString() })
      .eq("uuid", uuid);

    if (writeError) {
      return NextResponse.json({ ...draft, warnung: writeError.message });
    }

    return NextResponse.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
