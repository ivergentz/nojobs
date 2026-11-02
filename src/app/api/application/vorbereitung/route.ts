import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { vorbereitungFuerStelle, type Vorbereitung } from "@/lib/vorbereitung";
import VorbereitungDocument from "@/lib/pdf/VorbereitungDocument";
import { lesen } from "@/lib/lesen";
import { istStandard, NUR_EIGENES_PROFIL, profilAusRequest } from "@/lib/aktuelles-profil";

export const dynamic = "force-dynamic";
// Websuche (bis 75 s) + Briefing (bis 150 s). Vercel Hobby mit Fluid Compute erlaubt bis 300 s.
export const maxDuration = 300;

/**
 * Gesprächsvorbereitung.
 *
 * POST { uuid }        → neu erzeugen (ca. 20–40 s) und speichern
 * GET  ?uuid=…         → gespeicherte Vorbereitung als PDF
 */
export async function POST(request: Request) {
  // Schritt 2.2: nur für dein Profil.
  if (!istStandard(profilAusRequest(request))) return NextResponse.json({ error: NUR_EIGENES_PROFIL }, { status: 400 });
  try {
    const body = (await request.json()) as { uuid?: string };
    if (!body.uuid) return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });
    const vorbereitung = await vorbereitungFuerStelle(supabaseAdmin(), body.uuid);
    return NextResponse.json(vorbereitung);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

export async function GET(request: Request) {
  // Schritt 2.2: nur für dein Profil.
  if (!istStandard(profilAusRequest(request))) return NextResponse.json({ error: NUR_EIGENES_PROFIL }, { status: 400 });
  const uuid = new URL(request.url).searchParams.get("uuid");
  if (!uuid) return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });

  try {
    const { data: job, error } = await lesen(supabaseAdmin())
      .select("uuid,title,employer_name,municipal,county,country,vorbereitung")
      .eq("uuid", uuid)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!job?.vorbereitung) {
      return NextResponse.json({ error: "Noch keine Vorbereitung — erst auf der Unterlagen-Seite erzeugen." }, { status: 404 });
    }

    const employer = (job.employer_name as string) ?? "";
    const element = React.createElement(VorbereitungDocument, {
      data: job.vorbereitung as Vorbereitung,
      title: (job.title as string) ?? "",
      employer,
      place: [job.municipal, job.county].filter(Boolean).join(", ") || ((job.country as string) ?? ""),
    });
    const buffer = await renderToBuffer(element as any);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Vorbereitung_${slug(employer || "gespraech")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `PDF fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
