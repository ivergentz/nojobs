import { supabaseAdmin } from "./supabase";

/**
 * Kosten jedes Claude-Aufrufs — eine Zeile pro Aufruf in api_kosten.
 *
 * Gespeichert werden die rohen Token-Zahlen und der daraus berechnete
 * Betrag. Ändern sich die Preise, lassen sich die Beträge aus den Tokens neu
 * rechnen. Die Spalte "profil" ist für mehrere Personen vorbereitet und steht
 * bis dahin auf "iver".
 *
 * Schreiben darf nie einen Lauf stören: Fehlt die Tabelle (SQL kosten.sql
 * noch nicht ausgeführt) oder klemmt die Datenbank, wird still übersprungen.
 */

export type Zweck = "bewertung" | "unterlagen" | "fragen" | "vorbereitung" | "recherche" | "lebenslauf" | "suchprofil";

/** Sammelt die Kosten eines Laufs, z. B. für die Zeile im Laufprotokoll. */
export type Sammler = { usd: number; aufrufe: number };

export type KostenKontext = {
  zweck: Zweck;
  /** morgenlauf · steuerung · status · knopf — wer den Aufruf ausgelöst hat */
  anlass?: string;
  jobUuid?: string;
  profil?: string;
  sammler?: Sammler;
};

export type Verbrauch = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  suchen: number;
};

/**
 * US-Dollar pro Million Tokens (Stand Oktober 2026, anthropic.com/pricing —
 * bei Preisänderungen hier anpassen). Cache-Schreiben kostet das 1,25-fache
 * des Input-Preises, Cache-Lesen ein Zehntel. Websuche: 10 $ pro 1.000 Suchen.
 */
const PREISE: Array<{ muster: RegExp; input: number; output: number }> = [
  { muster: /sonnet/i, input: 2, output: 10 },
  { muster: /haiku/i, input: 0.1, output: 0.5 },
];
const USD_PRO_SUCHE = 10 / 1000;

export function berechneUsd(modell: string, v: Verbrauch): number | null {
  const preis = PREISE.find((p) => p.muster.test(modell));
  if (!preis) return null;
  const tokens =
    (v.input * preis.input + v.cacheWrite * preis.input * 1.25 + v.cacheRead * preis.input * 0.1 + v.output * preis.output) /
    1_000_000;
  return tokens + v.suchen * USD_PRO_SUCHE;
}

let tabelleFehlt = false;

export async function bucheKosten(
  modell: string,
  v: Verbrauch,
  kontext: KostenKontext | undefined,
  ok: boolean
): Promise<void> {
  const usd = berechneUsd(modell, v);
  if (kontext?.sammler) {
    kontext.sammler.usd += usd ?? 0;
    kontext.sammler.aufrufe += 1;
  }
  if (tabelleFehlt) return;
  try {
    const { error } = await supabaseAdmin()
      .from("api_kosten")
      .insert({
        profil: kontext?.profil ?? "iver",
        zweck: kontext?.zweck ?? "sonstiges",
        anlass: kontext?.anlass ?? null,
        job_uuid: kontext?.jobUuid ?? null,
        modell,
        input_tokens: v.input,
        output_tokens: v.output,
        cache_write_tokens: v.cacheWrite,
        cache_read_tokens: v.cacheRead,
        web_suchen: v.suchen,
        kosten_usd: usd,
        ok,
      });
    if (error && /api_kosten/.test(error.message)) tabelleFehlt = true;
  } catch {
    /* Kostenbuchung darf nie einen Lauf stören */
  }
}

const usdFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const centFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** 1,23 $ — Beträge unter einem Dollar als Cent: 4,2 ¢ */
export function usd(betrag: number): string {
  if (betrag > 0 && betrag < 1) return `${centFormat.format(betrag * 100)} ¢`;
  return `${usdFormat.format(betrag)} $`;
}
