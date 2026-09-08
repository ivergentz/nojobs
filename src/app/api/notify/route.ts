import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildMessage, findChatId, sendTelegram, type NotifyJob } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  const fromCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && !fromCron && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  try {
    // Einrichtungshilfe: ?chatid=1 liefert die Chat-ID des Bots.
    if (url.searchParams.get("chatid")) {
      return NextResponse.json({ ok: true, chats: await findChatId() });
    }

    const db = supabaseAdmin();

    const { data, error } = await db
      .from("jobs")
      .select("uuid,title,title_de,employer_name,municipal,county,country,eval_fit,eval_summary,application_url,application_due")
      .eq("status", "ACTIVE")
      .in("eval_fit", ["must_apply", "worth_reading"])
      .neq("eval_language", "scandinavian_required")
      .eq("app_status", "neu")
      .is("notified_at", null)
      .limit(30);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = data ?? [];
    const hot = rows.filter((row) => row.eval_fit === "must_apply");

    // Kein must_apply, keine Nachricht. Ein täglicher Leerlauf-Ping wäre der
    // schnellste Weg, die Benachrichtigung wegzuignorieren.
    if (hot.length === 0) {
      return NextResponse.json({ ok: true, gesendet: false, grund: "kein must_apply offen", offen: rows.length });
    }

    const jobs: NotifyJob[] = rows.map((row) => ({
      title: (row.title_de as string) ?? (row.title as string) ?? "Ohne Titel",
      employer: (row.employer_name as string) ?? "—",
      place: [row.municipal, row.county].filter(Boolean).join(", ") || ((row.country as string) ?? "—"),
      fit: (row.eval_fit as string) ?? "worth_reading",
      summary: (row.eval_summary as string) ?? "",
      url: (row.application_url as string) ?? null,
      due: (row.application_due as string) ?? null,
    }));

    const base = process.env.PUBLIC_BASE_URL ?? `https://${request.headers.get("host") ?? ""}`;
    if (url.searchParams.get("dry")) {
      return NextResponse.json({ ok: true, gesendet: false, vorschau: buildMessage(jobs, `${base}/inbox`) });
    }

    await sendTelegram(buildMessage(jobs, `${base}/inbox`));

    await db
      .from("jobs")
      .update({ notified_at: new Date().toISOString() })
      .in("uuid", rows.map((row) => row.uuid as string));

    return NextResponse.json({ ok: true, gesendet: true, stellen: rows.length, davonBewerben: hot.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
