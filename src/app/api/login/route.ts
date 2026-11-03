import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { linkMail, mailEingerichtet, sendeMail } from "@/lib/mail";
import { adminEmail, basisUrl, cookieOptionen, LINK_MINUTEN, neuerLink, neueSitzung, sicheresZiel, SITZUNG_COOKIE, SITZUNG_TAGE } from "@/lib/sitzung";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GLEICHE_ANTWORT = "Wenn die Adresse bei uns hinterlegt ist, kommt gleich eine E-Mail mit deinem Anmelde-Link.";
// Höchstens eine Mail pro Adresse und Minute (je Server-Instanz) — gegen versehentliches Mehrfachklicken und Spam.
const zuletzt = new Map<string, number>();

/**
 * Schritt 2.3 · Anmelden.
 *   POST { email, weiter? }   → Anmelde-Link per E-Mail (Brevo). Antwort immer gleich — verrät nicht, wer registriert ist.
 *   POST { schluessel }       → Notzugang für dich mit IMPORT_SECRET, falls der Mailversand klemmt.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; weiter?: string; schluessel?: string };

  if (typeof body.schluessel === "string" && body.schluessel) {
    const soll = process.env.IMPORT_SECRET || process.env.CRON_SECRET || "";
    const a = Buffer.from(body.schluessel);
    const b = Buffer.from(soll);
    if (!soll || a.length !== b.length || !timingSafeEqual(a, b)) {
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Schlüssel stimmt nicht." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, weiter: sicheresZiel(body.weiter) });
    res.cookies.set(SITZUNG_COOKIE, neueSitzung("iver", "admin"), cookieOptionen(SITZUNG_TAGE * 86400));
    return res;
  }

  const email = (body.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, { status: 400 });
  if (!mailEingerichtet()) {
    return NextResponse.json({ error: "Der E-Mail-Versand ist noch nicht eingerichtet (BREVO_API_KEY, LOGIN_ABSENDER)." }, { status: 503 });
  }
  const jetzt = Date.now();
  if ((zuletzt.get(email) ?? 0) > jetzt - 60_000) return NextResponse.json({ ok: true, hinweis: GLEICHE_ANTWORT });
  zuletzt.set(email, jetzt);

  try {
    let wer: { slug: string; name: string; rolle: "admin" | "nutzer" } | null = null;
    if (email === adminEmail()) {
      wer = { slug: "iver", name: "Iver", rolle: "admin" };
    } else {
      const { data } = await supabaseAdmin()
        .from("profiles")
        .select("slug,name,email,aktiv,rolle")
        .eq("email", email)
        .neq("rolle", "admin")
        .maybeSingle();
      if (data && data.aktiv !== false) wer = { slug: String(data.slug), name: String(data.name ?? ""), rolle: "nutzer" };
    }
    if (wer) {
      const basis = basisUrl(request);
      const ziel = sicheresZiel(body.weiter);
      const link = `${basis}/api/anmelden?t=${encodeURIComponent(neuerLink(wer.slug, wer.rolle))}${ziel !== "/inbox" ? `&weiter=${encodeURIComponent(ziel)}` : ""}`;
      const vorname = wer.name.split(" ")[0] || "";
      const { html, text } = linkMail({
        anrede: vorname ? `Hallo ${vorname},` : "Hallo,",
        absatz: "hier ist dein Anmelde-Link für die Career Inbox. Ein Klick genügt — ein Passwort brauchst du nicht.",
        knopf: "Jetzt anmelden",
        link,
        fuss: `Der Link gilt ${LINK_MINUTEN} Minuten. Du hast keine Anmeldung angefordert? Dann ignoriere diese E-Mail einfach.`,
      });
      await sendeMail({ email, name: wer.name }, "Dein Anmelde-Link für die Career Inbox", html, text);
    }
    return NextResponse.json({ ok: true, hinweis: GLEICHE_ANTWORT });
  } catch (err) {
    zuletzt.delete(email);
    return NextResponse.json({ error: `E-Mail konnte nicht gesendet werden: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
