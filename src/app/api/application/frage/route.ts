import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { beantworteFrage, type Frage } from "@/lib/fragen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fragen aus dem Bewerbungsformular.
 *
 * POST { uuid, aktion: "entwerfen", frage, limit? } → Antwort entwerfen und an die Liste anhängen
 * POST { uuid, aktion: "speichern", fragen }        → bearbeitete Liste sichern
 *
 * Gespeichert wird in application_draft.fragen. Gibt es noch keinen
 * Anschreiben-Entwurf, wird ein leerer angelegt — manche Formulare wollen
 * gar kein Anschreiben, nur die Fragen.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      uuid?: string;
      aktion?: "entwerfen" | "speichern";
      frage?: string;
      limit?: number | null;
      fragen?: Frage[];
    };
    if (!body.uuid) return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });

    const db = supabaseAdmin();
    const { data: job, error } = await db
      .from("jobs")
      .select("uuid,title,employer_name,description,application_draft")
      .eq("uuid", body.uuid)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job) return NextResponse.json({ error: "Stelle nicht gefunden" }, { status: 404 });

    const draft = (job.application_draft as Record<string, any> | null) ?? {
      lang: "de",
      role: "",
      recipient: [],
      subject: "",
      headline: "",
      paragraphs: [],
      signOff: "",
      cvOverrides: {},
      hinweise: [],
    };
    let fragen: Frage[] = Array.isArray(draft.fragen) ? draft.fragen : [];
    let hinweis = "";

    if (body.aktion === "speichern") {
      fragen = (body.fragen ?? []).filter((f) => f && typeof f.frage === "string");
    } else {
      const frage = (body.frage ?? "").trim();
      if (!frage) return NextResponse.json({ error: "Frage fehlt" }, { status: 400 });

      const anschreiben = [draft.headline, ...(draft.paragraphs ?? [])].filter(Boolean).join("\n\n");
      const result = await beantworteFrage({
        frage,
        limit: body.limit ?? null,
        lang: draft.lang === "en" ? "en" : "de",
        title: (job.title as string) ?? "",
        employer: (job.employer_name as string) ?? "",
        description: (job.description as string) ?? "",
        anschreiben,
        gehalt: draft.facts?.salary,
      });
      hinweis = result.hinweis;
      fragen = [
        ...fragen,
        { frage, antwort: result.antwort, limit: body.limit ?? null, erstellt: new Date().toISOString() },
      ];
    }

    const { error: writeError } = await db
      .from("jobs")
      .update({ application_draft: { ...draft, fragen } })
      .eq("uuid", body.uuid);
    if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

    return NextResponse.json({ ok: true, fragen, hinweis });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
