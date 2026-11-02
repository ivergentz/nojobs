import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeProfilVoll } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import LebenslaufClient, { type CvStand } from "./LebenslaufClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Profil · Career Inbox" };

/**
 * Schritt 2.4 · „Mein Profil“ für weitere Personen: Lebenslauf hochladen,
 * ausgelesene Struktur, vorgeschlagene Richtungen, Prüfbericht.
 * Dein Profil hat diese Seite nicht.
 */
export default async function ProfilSeite() {
  const slug = await profilAusCookies();
  if (istStandard(slug)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted">Career Inbox · Mein Profil</p>
        <p className="mt-4 max-w-lg text-sm leading-relaxed">
          Dein Profil nutzt den Lebenslauf von deiner Website — hier ist nichts zu tun.
        </p>
        <Link href="/inbox" className="mt-6 inline-block text-sm underline underline-offset-4">
          Zur Inbox
        </Link>
      </main>
    );
  }

  const db = supabaseAdmin();
  const [profil, id] = await Promise.all([ladeProfilVoll(db, slug), profilId(db, slug)]);
  let stand: CvStand | null = null;
  let hinweis: string | null = null;
  if (id) {
    const { data, error } = await db.from("profile_cv").select("*").eq("profile_id", id).maybeSingle();
    if (error) hinweis = "Noch nicht eingerichtet — supabase/lebenslauf.sql im SQL Editor ausführen.";
    else stand = (data as CvStand | null) ?? null;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Career Inbox · Mein Profil</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{profil?.name ?? slug}</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Lade deinen Lebenslauf hoch. Wir lesen ihn aus, schlagen dir passende Richtungen für die Suche vor und zeigen,
          was sich am Lebenslauf noch verbessern lässt. Erfunden wird nichts — was fehlt, fragen wir nach.
        </p>
      </header>
      {hinweis ? <p className="mt-8 text-sm text-drop">{hinweis}</p> : <LebenslaufClient initial={stand} />}
    </main>
  );
}
