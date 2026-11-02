import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aufraeumen, loeschenAn } from "@/lib/aufbewahrung";

export const dynamic = "force-dynamic";

/**
 * Räumt die Inbox auf. Zwei Regeln:
 *
 *  1. Bewerbungsfrist abgelaufen — dann ist die Stelle objektiv erledigt.
 *  2. Seit 14 Tagen unangetastet auf "neu".
 *  3. Aufbewahrungsregel (Schritt 1.5): unangetastete Stellen nach 60 Tagen,
 *     aussortierte Anzeigen nach 90 Tagen löschen — nur mit AUFRAEUMEN_LOESCHEN=an.
 *
 * Beide setzen den Status auf "abgelaufen" statt zu löschen. Die Stellen
 * verschwinden aus der Inbox, bleiben aber auffindbar.
 *
 * Gemessen wird ab dem ersten Import (imported_at), nicht ab der
 * Veröffentlichung: Bei der BA tragen neu geschaltete Anzeigen oft ein altes
 * Erstveröffentlichungsdatum und wären sonst schon beim Import "abgelaufen".
 * Der Import schreibt bekannte Stellen nicht neu, imported_at ist also das
 * Datum, an dem die Stelle zum ersten Mal auftauchte.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const days = Number(url.searchParams.get("days") ?? "14");
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const heute = new Date().toISOString().slice(0, 10);

  try {
    const db = supabaseAdmin();

    const { data: abgelaufen, error: fristError } = await db
      .from("jobs")
      .update({ app_status: "abgelaufen", app_status_at: new Date().toISOString() })
      .eq("app_status", "neu")
      .not("application_due", "is", null)
      .lt("application_due", heute)
      .select("uuid");

    if (fristError) return NextResponse.json({ ok: false, error: fristError.message }, { status: 500 });

    const { data: liegengeblieben, error: altError } = await db
      .from("jobs")
      .update({ app_status: "abgelaufen", app_status_at: new Date().toISOString() })
      .eq("app_status", "neu")
      .lt("imported_at", cutoff)
      .select("uuid");

    if (altError) return NextResponse.json({ ok: false, error: altError.message }, { status: 500 });

    // 3. Aufbewahrungsregel (Schritt 1.5): ohne Schalter nur Vorschau, mit AUFRAEUMEN_LOESCHEN=an löschen.
    //    Scheitert sie, ist das Aufräumen trotzdem erfolgreich — die Inbox hängt nicht davon ab.
    const aufbewahrung = await aufraeumen(db, loeschenAn());

    return NextResponse.json({
      ok: true,
      fristAbgelaufen: abgelaufen?.length ?? 0,
      liegengeblieben: liegengeblieben?.length ?? 0,
      tage: days,
      aufbewahrung,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
