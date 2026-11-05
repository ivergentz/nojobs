/**
 * Pause bei Inaktivität (nur weitere Profile, nie dein Profil).
 *
 * Wer 7 Tage nicht in nojobs war, bekommt keine KI-Bewertung und keine Telegram-Morgennachricht mehr —
 * die kostenlose Suche (Arbeitsagentur, Adzuna) läuft weiter. Beim nächsten Besuch geht es automatisch
 * weiter: die neuen Stellen der letzten 7 Tage werden im Hintergrund bewertet.
 * Kurz vor der Pause kommt eine letzte Nachricht (Telegram, sonst Mail).
 *
 * Gespeichert in import_cursor (id „aktiv:<slug>“): last_run_at = zuletzt aktiv,
 * at_end = Pause wurde gemeldet. Bewusst nicht in profiles.einstellungen, damit ein Seitenaufruf nie
 * gleichzeitige Änderungen am Profil überschreibt. Keine Schemaänderung.
 */

export const PAUSE_TAGE = 7;
const MERKEN_ALLE_MS = 60 * 60 * 1000;

type Db = { from: (tabelle: string) => any };

export type Aktivitaet = { zuletzt: string | null; gemeldet: boolean };

const id = (slug: string) => `aktiv:${slug}`;

export function istPausiert(a: Aktivitaet | undefined, jetzt = Date.now()): boolean {
  if (!a?.zuletzt) return false; // ohne Eintrag (z. B. vor Einführung) nie pausieren
  return jetzt - new Date(a.zuletzt).getTime() >= PAUSE_TAGE * 864e5;
}

/** Was der Morgenlauf mit einem weiteren Profil macht. */
export function entscheide(a: Aktivitaet | undefined, jetzt = Date.now()): "uhr-starten" | "aktiv" | "pause-melden" | "pausiert" {
  if (!a?.zuletzt) return "uhr-starten";
  if (!istPausiert(a, jetzt)) return "aktiv";
  return a.gemeldet ? "pausiert" : "pause-melden";
}

export function tageInaktiv(a: Aktivitaet | undefined, jetzt = Date.now()): number | null {
  return a?.zuletzt ? Math.floor((jetzt - new Date(a.zuletzt).getTime()) / 864e5) : null;
}

export async function ladeAktivitaeten(db: Db): Promise<Map<string, Aktivitaet>> {
  const m = new Map<string, Aktivitaet>();
  try {
    const { data } = await db.from("import_cursor").select("id,last_run_at,at_end").like("id", "aktiv:%");
    for (const r of (data ?? []) as Array<{ id: string; last_run_at: string | null; at_end: boolean | null }>) {
      m.set(r.id.slice(6), { zuletzt: r.last_run_at, gemeldet: r.at_end === true });
    }
  } catch {
    /* ohne Daten: niemand gilt als pausiert */
  }
  return m;
}

export async function ladeAktivitaet(db: Db, slug: string): Promise<Aktivitaet | undefined> {
  try {
    const { data } = await db.from("import_cursor").select("last_run_at,at_end").eq("id", id(slug)).maybeSingle();
    return data ? { zuletzt: data.last_run_at ?? null, gemeldet: data.at_end === true } : undefined;
  } catch {
    return undefined;
  }
}

async function schreibe(db: Db, slug: string, zuletzt: string, gemeldet: boolean, notiz: string) {
  await db
    .from("import_cursor")
    .upsert([{ id: id(slug), pages_done: 0, items_seen: 0, at_end: gemeldet, last_item_date: zuletzt, last_run_at: zuletzt, last_note: notiz }], { onConflict: "id" });
}

/**
 * Seitenaufruf einer angemeldeten Person merken — höchstens einmal pro Stunde.
 * Gibt zurück, ob die Person gerade aus einer Pause zurückkommt.
 */
export async function merkeAktivitaet(db: Db, slug: string, jetzt = Date.now()): Promise<{ zurueck: boolean }> {
  try {
    const alt = await ladeAktivitaet(db, slug);
    const zurueck = istPausiert(alt, jetzt);
    if (alt?.zuletzt && !zurueck && jetzt - new Date(alt.zuletzt).getTime() < MERKEN_ALLE_MS) return { zurueck: false };
    await schreibe(db, slug, new Date(jetzt).toISOString(), false, zurueck ? "zurück aus der Pause" : "aktiv");
    return { zurueck };
  } catch {
    return { zurueck: false };
  }
}

/** Morgenlauf: ohne Eintrag die Uhr starten (Einführung), Pause einmalig als gemeldet markieren. */
export async function starteUhr(db: Db, slug: string, jetzt = Date.now()) {
  await schreibe(db, slug, new Date(jetzt).toISOString(), false, "Beginn der Messung");
}

export async function markiereGemeldet(db: Db, slug: string, a: Aktivitaet) {
  await schreibe(db, slug, a.zuletzt ?? new Date().toISOString(), true, "Pause gemeldet");
}

export function pausenText(name: string, link: string): { telegram: string; betreff: string; absatz: string } {
  const vorname = name.split(" ")[0] || name;
  return {
    telegram: `Hallo ${vorname}, du warst ${PAUSE_TAGE} Tage nicht in nojobs. Wir pausieren deine täglichen Bewertungen, bis du wieder vorbeischaust — ein Klick genügt, dann geht es automatisch weiter:\n${link}`,
    betreff: "nojobs pausiert deine Suche",
    absatz: `du warst ${PAUSE_TAGE} Tage nicht in nojobs. Wir pausieren deine täglichen Bewertungen, bis du wieder vorbeischaust. Ein Klick genügt — dann bewertet nojobs die neuen Stellen der letzten Tage und es geht wie gewohnt weiter.`,
  };
}
