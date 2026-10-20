import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { applyOverrides, type ApplicationDraft } from "@/lib/application";
import { loadCv } from "@/lib/cv-source";
import CvDocument from "@/lib/pdf/CvDocument";
import LetterDocument from "@/lib/pdf/LetterDocument";
import { ensureRef, trackingLink } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äàáâ]/g, "a")
    .replace(/[öòóô]/g, "o")
    .replace(/[üùúû]/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * ?uuid=…&doc=letter|cv
 * Lebenslauf, Schriften und Foto kommen live von ivergentz.de.
 * Statt der allgemeinen Web-Adresse steht der persönliche Bewerbungs-Link
 * im Dokument (iverbohnes.de/firma), damit Aufrufe zugeordnet werden können.
 */
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
    const lang = draft.lang === "en" ? "en" : "de";
    const { cv: cvRoh, quelle } = await loadCv(lang);
    const ref = await ensureRef(db, uuid);
    const cv = ref ? { ...cvRoh, contact: { ...cvRoh.contact, web: trackingLink(ref).text } } : cvRoh;

    const element =
      doc === "cv"
        ? React.createElement(CvDocument, { cv: applyOverrides(cv, draft.cvOverrides ?? {}), lang })
        : React.createElement(LetterDocument, { data: draft, cv });

    const buffer = await renderToBuffer(element as any);
    const firma = slug((job.employer_name as string) ?? "bewerbung");
    const name =
      doc === "cv"
        ? `${lang === "de" ? "Lebenslauf" : "CV"}_Iver_Bohnes_${firma}.pdf`
        : `${lang === "de" ? "Anschreiben" : "Cover_Letter"}_Iver_Bohnes_${firma}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-CV-Quelle": quelle,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `PDF fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
