import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { istGrund } from "@/lib/gruende";

export const dynamic = "force-dynamic";

const ALLOWED = ["must_apply", "worth_reading", "ignore"];

/**
 * Speichert ein Urteil — und optional die Begründung dazu.
 *
 *   { uuid, label }                      → Urteil setzen (null = aufheben)
 *   { uuid, label, gruende, notiz }      → Urteil plus Begründung
 *
 * Fehlen die Spalten für die Begründung (SQL label-gruende.sql noch nicht
 * ausgeführt), wird das Urteil trotzdem gespeichert.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      uuid?: string;
      label?: string | null;
      gruende?: string[];
      notiz?: string;
    };

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

    // Begründung: beim Setzen mitschreiben, beim Aufheben löschen.
    const mitGrund = body.gruende !== undefined || body.notiz !== undefined || body.label === null;
    if (mitGrund) {
      const gruende = body.label ? (body.gruende ?? []).filter(istGrund).slice(0, 6) : null;
      const notiz = body.label ? (body.notiz ?? "").trim().slice(0, 300) || null : null;
      const { error: grundError } = await db
        .from("jobs")
        .update({ label_gruende: gruende?.length ? gruende : null, label_notiz: notiz })
        .eq("uuid", body.uuid);
      if (grundError && body.label) {
        return NextResponse.json({ ok: true, warnung: `Begründung nicht gespeichert: ${grundError.message}` });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
