import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { buildMessage, findChatId, sendTelegram, type NotifyJob } from "@/lib/notify";
import { runEvaluation } from "@/lib/run-evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Morgen-Cron: erst bewerten, was der nächtliche Import geholt hat, dann
 * benachrichtigen. Die Bewertung lief vorher als letzter Schritt im
 * Tageslauf und bekam dort regelmäßig keine Zeit mehr — die Inbox blieb leer.
 *
 * ?skipEval=1  — nur benachrichtigen
 * ?dry=1       — Nachricht nur anzeigen, nicht senden
 * ?chatid=1    — Einrichtungshilfe: Chat-ID des Bots
 * ?test=1      — Testnachricht senden (prüft Token und Chat-ID)
 *
 * Geschickt wird nur, wenn mindestens eine Stelle auf "Bewerben" steht —
 * ein täglicher Leerlauf-Ping wäre der schnellste Weg, die Nachrichten
 * wegzuignorieren. Die Antwort sagt immer, warum nichts kam.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  try {
    if (url.searchParams.get("chatid")) {
      return NextResponse.json({ ok: true, chats: await findChatId() });
    }

    if (url.searchParams.get("test")) {
      await sendTelegram("✅ Career Inbox: Testnachricht. Token und Chat-ID funktionieren.");
      return NextResponse.json({ ok: true, gesendet: true, test: true });
    }

    const db = supabaseAdmin();

    let bewertung: Awaited<ReturnType<typeof runEvaluation>> | { fehler: string } | null = null;
    if (!url.searchParams.get("skipEval")) {
      try {
        bewertung = await runEvaluation(db, { budgetMs: 18_000 });
      } catch (error) {
        bewertung = { fehler: error instanceof Error ? error.message : String(error) };
      }
    }

    const { data, error } = await db
      .from("jobs")
      .select("uuid,title,employer_name,municipal,county,country,eval_fit,eval_summary,application_url,application_due")
      .eq("status", "ACTIVE")
      .eq("source", "ba")
      .in("eval_fit", ["must_apply", "worth_reading"])
      .eq("app_status", "neu")
      .is("notified_at", null)
      .limit(30);

    if (error) return NextResponse.json({ ok: false, error: error.message, bewertung }, { status: 500 });

    const rows = data ?? [];
    const hot = rows.filter((row) => row.eval_fit === "must_apply");

    // Kein must_apply, keine Nachricht. Ein täglicher Leerlauf-Ping wäre der
    // schnellste Weg, die Benachrichtigung wegzuignorieren.
    if (hot.length === 0) {
      return NextResponse.json({
        ok: true,
        gesendet: false,
        grund: "kein must_apply offen",
        offen: rows.length,
        bewertung,
      });
    }

    const jobs: NotifyJob[] = rows.map((row) => ({
      title: (row.title as string) ?? "Ohne Titel",
      employer: (row.employer_name as string) ?? "—",
      place: [row.municipal, row.county].filter(Boolean).join(", ") || ((row.country as string) ?? "—"),
      fit: (row.eval_fit as string) ?? "worth_reading",
      summary: (row.eval_summary as string) ?? "",
      url: (row.application_url as string) ?? null,
      due: (row.application_due as string) ?? null,
    }));

    const base = process.env.PUBLIC_BASE_URL ?? `https://${request.headers.get("host") ?? ""}`;
    if (url.searchParams.get("dry")) {
      return NextResponse.json({
        ok: true,
        gesendet: false,
        vorschau: buildMessage(jobs, `${base}/inbox`),
        bewertung,
      });
    }

    await sendTelegram(buildMessage(jobs, `${base}/inbox`));

    await db
      .from("jobs")
      .update({ notified_at: new Date().toISOString() })
      .in("uuid", rows.map((row) => row.uuid as string));

    return NextResponse.json({
      ok: true,
      gesendet: true,
      stellen: rows.length,
      davonBewerben: hot.length,
      bewertung,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
