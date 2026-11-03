import type { ProfilErgebnis } from "./kennzahlen";

/**
 * Hochrechnung für den täglichen Betrieb. Alles, was nicht gemessen ist, steht als Annahme im Ergebnis.
 *
 * Gemessen (aus dem Benchmark):
 *   - zusätzliche, nicht ausgeschlossene Stellen (relevant + unklar) je erfolgreicher Anfrage
 *   - Anteil davon, der höchstens 7 Tage alt ist → grob: ein Siebtel davon ist pro Tag neu
 * Angenommen (Parameter):
 *   - Anfragen je Profil und Tag
 *   - SerpApi-Preisstufen (Preisseite, Stand Nov. 2026), Adzuna-Standardgrenzen (laut Drittquelle)
 *   - Kosten je KI-Bewertung: aus api_kosten (letzte 30 Tage), sonst Beobachtung aus dem Quellen-Log
 */

export const SERPAPI_STUFEN = [
  { name: "Free", usd: 0, suchen: 250 },
  { name: "Starter", usd: 25, suchen: 1000 },
  { name: "Developer", usd: 75, suchen: 5000 },
  { name: "Production", usd: 150, suchen: 15000 },
  { name: "Big Data", usd: 275, suchen: 30000 },
];
/** Adzuna-Standardgrenzen für freie Schlüssel (laut Drittquelle; offiziell nur „im Konto sichtbar“) */
export const ADZUNA_GRENZEN = { proTag: 250, proMonat: 2500 };
/** Beobachtung Quellen-Log 03.11.2026: 30 Bewertungen = 77,32 ¢ → 0,0258 $ je Bewertung */
export const KI_USD_BEOBACHTET = 0.7732 / 30;

export type Annahmen = {
  googleProProfilTag: number;
  adzunaProProfilTag: number;
  googleProduktionProTag: number;
  kiUsdProBewertung: number;
  kiQuelle: string;
};

export type Messwerte = {
  /** relevant + unklar zusätzlich je erfolgreicher Anfrage, Mittel über Profile */
  google: { neuJeAnfrage: number | null; anteilFrisch: number | null };
  adzuna: { neuJeAnfrage: number | null; anteilFrisch: number | null };
};

export function messwerte(ergebnisse: ProfilErgebnis[]): Messwerte {
  const fuer = (q: "google" | "adzuna") => {
    let neu = 0;
    let anfragen = 0;
    let frisch = 0;
    let datiert = 0;
    for (const e of ergebnisse) {
      const z = e.quellen[q];
      neu += z.zusaetzlichRelevant + z.zusaetzlichUnklar;
      anfragen += z.anfragen - z.anfragenFehler;
      frisch += z.hoechstens7Tage;
      datiert += z.mitDatum;
    }
    return { neuJeAnfrage: anfragen > 0 ? neu / anfragen : null, anteilFrisch: datiert > 0 ? frisch / datiert : null };
  };
  return { google: fuer("google"), adzuna: fuer("adzuna") };
}

export function serpStufe(suchenProMonat: number) {
  return SERPAPI_STUFEN.find((s) => s.suchen >= suchenProMonat) ?? null;
}

export type Zeile = {
  profile: number;
  google: { anfragenTag: number; anfragenMonat: number; neuTag: number | null; stufe: string; usdMonat: number | null };
  adzuna: { anfragenTag: number; anfragenMonat: number; neuTag: number | null; innerhalbFrei: boolean; usdMonat: number | null };
  kiBewertungenTag: number | null;
  kiUsdMonat: number | null;
};

export function hochrechnen(profile: number, m: Messwerte, a: Annahmen): Zeile {
  const tag = (q: "google" | "adzuna", anfragen: number) => {
    const w = m[q];
    if (w.neuJeAnfrage === null) return null;
    // Nur der frische Teil ist am nächsten Tag wirklich neu; ohne Datum konservativ alles als 7-Tage-Bestand.
    return (w.neuJeAnfrage * anfragen * (w.anteilFrisch ?? 1)) / 7;
  };
  const gTag = profile * a.googleProProfilTag;
  const gMonat = gTag * 30;
  const bedarf = gMonat + a.googleProduktionProTag * 30;
  const stufe = serpStufe(bedarf);
  const zTag = profile * a.adzunaProProfilTag;
  const zMonat = zTag * 30;
  const frei = zTag <= ADZUNA_GRENZEN.proTag && zMonat <= ADZUNA_GRENZEN.proMonat;
  const gNeu = tag("google", gTag);
  const zNeu = tag("adzuna", zTag);
  // Obergrenze: Überschneidung Google↔Adzuna wird hier nicht abgezogen.
  const ki = gNeu === null && zNeu === null ? null : (gNeu ?? 0) + (zNeu ?? 0);
  return {
    profile,
    google: { anfragenTag: gTag, anfragenMonat: gMonat, neuTag: gNeu, stufe: stufe ? `${stufe.name} (${stufe.suchen}/Monat)` : "über 30.000 — individuell", usdMonat: stufe ? stufe.usd : null },
    adzuna: { anfragenTag: zTag, anfragenMonat: zMonat, neuTag: zNeu, innerhalbFrei: frei, usdMonat: frei ? 0 : null },
    kiBewertungenTag: ki,
    kiUsdMonat: ki === null ? null : ki * 30 * a.kiUsdProBewertung,
  };
}
