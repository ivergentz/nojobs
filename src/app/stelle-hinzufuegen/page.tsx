import StelleHinzufuegenClient from "./StelleHinzufuegenClient";
import PlattformSuchen from "./PlattformSuchen";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeProfilVoll, STANDARD_SLUG } from "@/lib/profil";
import { aktiveBaBegriffe, ladePflege } from "@/lib/suchpflege";

export const metadata = { title: "Stelle hinzufügen · nojobs" };
export const dynamic = "force-dynamic";

/** Suchbegriffe, Ort und Umkreis des aktuellen Profils — für die fertigen Suchen auf den Jobbörsen. */
async function suche(): Promise<{ begriffe: string[]; ort: string | null; umkreisKm: number }> {
  try {
    const slug = await profilAusCookies();
    const db = supabaseAdmin();
    if (istStandard(slug)) return { begriffe: aktiveBaBegriffe(await ladePflege(db, STANDARD_SLUG)), ort: "Hamburg", umkreisKm: 25 };
    const p = await ladeProfilVoll(db, slug);
    return { begriffe: p?.suchbegriffe ?? [], ort: p?.suchort.ort ?? null, umkreisKm: p?.suchort.umkreis ?? 25 };
  } catch {
    return { begriffe: [], ort: null, umkreisKm: 25 };
  }
}

/** Eine Stelle, die nojobs nicht selbst gefunden hat, per Link oder Text übernehmen — mit Bewertung und allen Funktionen. */
export default async function StelleHinzufuegenPage() {
  const s = await suche();
  return (
    <main className="page max-w-3xl">
      <header className="mb-2">
        <p className="eyebrow">Meine Jobs</p>
        <h1 className="page-title mt-1.5">Stelle hinzufügen</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Du hast woanders eine passende Stelle gefunden? Füge den Link ein. nojobs liest die Anzeige, bewertet sie wie jede andere und legt sie
          unter <span className="font-medium text-ink">Vorgemerkt</span> ab — mit Unterlagen, Gesprächsvorbereitung und allem, was dazugehört.
        </p>
      </header>
      <StelleHinzufuegenClient />
      <section className="mt-6 text-xs leading-relaxed text-muted">
        <p className="font-medium text-ink/80">Gut zu wissen</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Am besten der Link direkt zur Anzeige beim Unternehmen. Bei LinkedIn: „Auf Unternehmenswebsite bewerben“ öffnen und diesen Link nehmen.</li>
          <li>Manche Seiten laden ihren Inhalt erst im Browser. Dann bittet nojobs dich, den Text der Anzeige einzufügen (markieren, kopieren, einfügen).</li>
          <li>Gibt es die Stelle schon in nojobs, öffnet sich die vorhandene — doppelt wird nichts angelegt.</li>
          <li>Bis zu 20 Stellen pro Tag.</li>
        </ul>
      </section>
      <PlattformSuchen begriffe={s.begriffe} ort={s.ort} umkreisKm={s.umkreisKm} />
    </main>
  );
}
