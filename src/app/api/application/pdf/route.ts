import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { applyOverrides, type ApplicationDraft } from "@/lib/application";
import CvDocument from "@/lib/pdf/CvDocument";
import LetterDocument from "@/lib/pdf/LetterDocument";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äàáâ]/g, "a")
    .replace(/[öòóô]/g, "o")
    .replace(/[üùúû]/g, "u")
    .replace(/[åæ]/g, "a")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const uuid = url.searchParams.get("uuid");
  const doc = url.searchParams.get("doc") ?? "letter";

  if (!uuid) return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });

  try {
    const db = supabaseAdmin();
    const { data: job, error } = await db
      .from("jobs")
      .select("uuid,title,employer_name,application_draft")
      .eq("uuid", uuid)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job?.application_draft) {
      return NextResponse.json({ error: "Noch kein Entwurf vorhanden" }, { status: 404 });
    }

    const draft = job.application_draft as ApplicationDraft;
    const element =
      doc === "cv"
        ? React.createElement(CvDocument, {
            cv: applyOverrides(draft.lang, draft.cvOverrides ?? {}),
            lang: draft.lang,
          })
        : React.createElement(LetterDocument, { data: draft });

    const buffer = await renderToBuffer(element as any);
    const name = `${doc === "cv" ? "CV" : draft.lang === "de" ? "Anschreiben" : "Cover-Letter"}_Iver-Bohnes_${slug(
      (job.employer_name as string) ?? "bewerbung"
    )}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
