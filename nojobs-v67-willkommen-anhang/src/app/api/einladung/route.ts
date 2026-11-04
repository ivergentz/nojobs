import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { linkMail, sendeMail } from "@/lib/mail";
import { WILLKOMMEN_PDF_BASE64, WILLKOMMEN_PDF_NAME } from "@/lib/willkommen-pdf";
import { ladeProfilVoll } from "@/lib/profil";
import { adminEmail, basisUrl, neuerLink, sitzungAusHeader } from "@/lib/sitzung";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = "force-dynamic";

const GUELTIG_TAGE = 7;

/** Schritt 2.3 · Einladung per E-Mail (nur du): Link gilt 7 Tage, danach meldet sich die Person selbst unter /login an. */
export async function POST(request: Request) {
  const sitzung = sitzungAusHeader(request.headers.get("cookie"));
  if (sitzung?.r !== "admin" && !(Boolean(process.env.IMPORT_SECRET || process.env.CRON_SECRET) && authorized(request))) {
    return NextResponse.json({ error: "Nur für den Admin." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { slug?: string; email?: string };
  if (!body.slug || body.slug === "iver") return NextResponse.json({ error: "Profil fehlt." }, { status: 400 });
  try {
    const db = supabaseAdmin();
    const p = await ladeProfilVoll(db, body.slug);
    if (!p || p.rolle === "admin") return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
    if (p.aktiv === false) return NextResponse.json({ error: "Profil ist deaktiviert." }, { status: 400 });
    // Neue oder geänderte Adresse hinterlegen
    const neu = (body.email ?? "").trim().toLowerCase().slice(0, 160);
    if (neu && neu !== (p.email ?? "").toLowerCase()) {
      if (!EMAIL.test(neu)) return NextResponse.json({ error: "Die E-Mail-Adresse sieht nicht gültig aus." }, { status: 400 });
      if (neu === adminEmail()) return NextResponse.json({ error: "Das ist deine Admin-Adresse." }, { status: 400 });
      const { data: belegt } = await db.from("profiles").select("slug").eq("email", neu).neq("slug", p.slug).limit(1);
      if (belegt && belegt.length) return NextResponse.json({ error: "Diese Adresse gehört schon zu einem anderen Profil." }, { status: 400 });
      const { error } = await db.from("profiles").update({ email: neu, updated_at: new Date().toISOString() }).eq("slug", p.slug).neq("rolle", "admin");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      p.email = neu;
    }
    if (!p.email) return NextResponse.json({ error: "Bitte eine E-Mail-Adresse angeben." }, { status: 400 });
    const basis = basisUrl(request);
    const link = `${basis}/api/anmelden?t=${encodeURIComponent(neuerLink(p.slug, "nutzer", GUELTIG_TAGE * 24 * 60))}&weiter=${encodeURIComponent("/profil")}`;
    const vorname = p.name.split(" ")[0] || "";
    const { html, text } = linkMail({
      anrede: vorname ? `Hallo ${vorname},` : "Hallo,",
      absatz:
        "du bist zur Career Inbox eingeladen. Lade deinen Lebenslauf hoch, beantworte ein paar Fragen — danach suchen und bewerten wir jeden Tag passende Stellen für dich.",
      knopf: "Loslegen",
      link,
      fuss: `Der Link gilt ${GUELTIG_TAGE} Tage. Später meldest du dich einfach mit deiner E-Mail-Adresse an — ohne Passwort. Im Anhang findest du eine Kurzanleitung für den Start.`,
    });
    await sendeMail({ email: p.email, name: p.name }, "Deine Einladung zur Career Inbox", html, text, [
      { name: WILLKOMMEN_PDF_NAME, inhaltBase64: WILLKOMMEN_PDF_BASE64 },
    ]);
    return NextResponse.json({ ok: true, an: p.email });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
