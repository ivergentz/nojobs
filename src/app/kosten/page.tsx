import { supabaseAdmin } from "@/lib/supabase";
import { usd } from "@/lib/kosten";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kosten · Career Inbox" };

/**
 * Kosten der Claude API — pro Lauf, pro Zweck, pro Person.
 *
 * Liest die Tagessummen aus der Sicht api_kosten_tag (supabase/kosten.sql).
 * Beträge sind aus Tokens zu Listenpreisen berechnet; maßgeblich bleibt die
 * Abrechnung in der Claude Console.
 */

type Zeile = {
  tag: string;
  profil: string;
  zweck: string;
  anlass: string;
  aufrufe: number;
  stellen: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  web_suchen: number;
  kosten_usd: number;
  fehlgeschlagen: number;
};

const ANLASS: Record<string, string> = {
  morgenlauf: "☀️ Morgenlauf",
  steuerung: "Steuerung",
  status: "Automatisch bei „Beworben“",
  knopf: "Von Hand",
  "–": "ohne Angabe",
};

const ZWECK: Record<string, string> = {
  bewertung: "Bewertung",
  unterlagen: "Anschreiben + Lebenslauf",
  fragen: "Formularfragen",
  vorbereitung: "Gesprächsvorbereitung",
  recherche: "Websuche zum Unternehmen",
  lebenslauf: "Lebenslauf auslesen",
  suchprofil: "Suchprofil vorschlagen",
  einlesen: "Stelle einlesen",
  sonstiges: "Sonstiges",
};

const zahl = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const prozent = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });

function tagText(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function berlinHeute(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

function tageZurueck(n: number): string {
  return new Date(Date.now() - n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

function summe(zeilen: Zeile[], feld: keyof Zeile): number {
  return zeilen.reduce((acc, z) => acc + Number(z[feld] ?? 0), 0);
}

export default async function KostenPage() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("api_kosten_tag")
    .select("*")
    .gte("tag", tageZurueck(35))
    .order("tag", { ascending: false })
    .limit(5000);

  const zeilen: Zeile[] = ((data ?? []) as Record<string, unknown>[]).map((z) => ({
    tag: String(z.tag),
    profil: String(z.profil),
    zweck: String(z.zweck),
    anlass: String(z.anlass),
    aufrufe: Number(z.aufrufe ?? 0),
    stellen: Number(z.stellen ?? 0),
    input_tokens: Number(z.input_tokens ?? 0),
    output_tokens: Number(z.output_tokens ?? 0),
    cache_write_tokens: Number(z.cache_write_tokens ?? 0),
    cache_read_tokens: Number(z.cache_read_tokens ?? 0),
    web_suchen: Number(z.web_suchen ?? 0),
    kosten_usd: Number(z.kosten_usd ?? 0),
    fehlgeschlagen: Number(z.fehlgeschlagen ?? 0),
  }));

  const heute = berlinHeute();
  const monatsanfang = `${heute.slice(0, 7)}-01`;
  const seit7 = tageZurueck(6);
  const seit30 = tageZurueck(29);

  const z30 = zeilen.filter((z) => z.tag >= seit30);
  const kacheln = [
    { label: "Heute", wert: summe(zeilen.filter((z) => z.tag === heute), "kosten_usd") },
    { label: "Letzte 7 Tage", wert: summe(zeilen.filter((z) => z.tag >= seit7), "kosten_usd") },
    { label: "Dieser Monat", wert: summe(zeilen.filter((z) => z.tag >= monatsanfang), "kosten_usd") },
    {
      label: "Hochrechnung 30 Tage",
      wert: (summe(zeilen.filter((z) => z.tag >= seit7), "kosten_usd") / 7) * 30,
      hinweis: "aus dem Schnitt der letzten 7 Tage",
    },
  ];

  // Pro Lauf: Tag + Anlass, letzte 14 Tage
  const laeufe = new Map<string, { tag: string; anlass: string; stellen: number; bewertungUsd: number; sonst: number; usd: number; fehler: number }>();
  for (const z of zeilen.filter((z) => z.tag >= tageZurueck(13))) {
    const key = `${z.tag}|${z.anlass}`;
    const lauf = laeufe.get(key) ?? { tag: z.tag, anlass: z.anlass, stellen: 0, bewertungUsd: 0, sonst: 0, usd: 0, fehler: 0 };
    if (z.zweck === "bewertung") {
      lauf.stellen += z.stellen;
      lauf.bewertungUsd += z.kosten_usd;
    } else {
      lauf.sonst += z.aufrufe;
    }
    lauf.usd += z.kosten_usd;
    lauf.fehler += z.fehlgeschlagen;
    laeufe.set(key, lauf);
  }
  const laufListe = Array.from(laeufe.values()).sort((a, b) => (a.tag === b.tag ? a.anlass.localeCompare(b.anlass) : b.tag.localeCompare(a.tag)));

  // Pro Zweck, 30 Tage
  const gesamt30 = summe(z30, "kosten_usd");
  const zwecke = new Map<string, { aufrufe: number; usd: number; suchen: number }>();
  for (const z of z30) {
    const e = zwecke.get(z.zweck) ?? { aufrufe: 0, usd: 0, suchen: 0 };
    e.aufrufe += z.aufrufe;
    e.usd += z.kosten_usd;
    e.suchen += z.web_suchen;
    zwecke.set(z.zweck, e);
  }
  const zweckListe = Array.from(zwecke.entries()).sort((a, b) => b[1].usd - a[1].usd);

  // Pro Person, 30 Tage
  const personen = new Map<string, { stellen: number; bewertungUsd: number; usd: number; tage: Set<string> }>();
  for (const z of z30) {
    const p = personen.get(z.profil) ?? { stellen: 0, bewertungUsd: 0, usd: 0, tage: new Set<string>() };
    if (z.zweck === "bewertung") {
      p.stellen += z.stellen;
      p.bewertungUsd += z.kosten_usd;
    }
    p.usd += z.kosten_usd;
    p.tage.add(z.tag);
    personen.set(z.profil, p);
  }
  const personListe = Array.from(personen.entries()).sort((a, b) => b[1].usd - a[1].usd);

  // Cache-Anteil der Bewertung: wie viel vom Systemteil aus dem Cache kam
  const bew30 = z30.filter((z) => z.zweck === "bewertung");
  const eingabe = summe(bew30, "input_tokens") + summe(bew30, "cache_write_tokens") + summe(bew30, "cache_read_tokens");
  const cacheAnteil = eingabe > 0 ? summe(bew30, "cache_read_tokens") / eingabe : null;

  return (
    <main className="page">
      <header className="mb-2">
        <p className="eyebrow">Kosten</p>
        <h1 className="page-title mt-1.5">Was die Claude API kostet</h1>
        <p className="page-lead">
          Jeder Aufruf wird mit Tokens und Betrag mitgeschrieben — pro Lauf, Zweck und Person. Die Beträge
          sind aus den Listenpreisen berechnet; maßgeblich ist die Abrechnung in der Claude Console.
        </p>
      </header>

      {error && (
        <p className="alert-error mt-6">
          Kosten nicht lesbar: {error.message}. Wurde <code>supabase/kosten.sql</code> im SQL Editor ausgeführt?
        </p>
      )}

      {!error && zeilen.length === 0 && (
        <p className="alert-info mt-6">
          Noch keine Kosten erfasst. Die erste Zeile entsteht beim nächsten Claude-Aufruf — spätestens im
          Morgenlauf.
        </p>
      )}

      {zeilen.length > 0 && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kacheln.map((k) => (
              <div key={k.label} className="metric">
                <p className="metric-label">{k.label}</p>
                <p className="metric-value text-xl">{usd(k.wert)}</p>
                {k.hinweis && <p className="mt-0.5 text-[11px] leading-tight text-muted">{k.hinweis}</p>}
              </div>
            ))}
          </section>

          <section className="card-pad mt-5">
            <h2 className="section-title text-base">Pro Lauf · letzte 14 Tage</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-muted [&_th]:bg-subtle/60 [&_th]:px-2">
                  <tr>
                    <th className="py-1.5 pr-3 font-normal">Tag</th>
                    <th className="py-1.5 pr-3 font-normal">Anlass</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Stellen bewertet</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Ø je Stelle</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Sonstige Aufrufe</th>
                    <th className="py-1.5 text-right font-normal">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {laufListe.map((l) => (
                    <tr key={`${l.tag}|${l.anlass}`} className="border-t border-rule/60">
                      <td className="tnum py-1.5 pr-3">{tagText(l.tag)}</td>
                      <td className="py-1.5 pr-3">
                        {ANLASS[l.anlass] ?? l.anlass}
                        {l.fehler > 0 && <span className="ml-2 text-xs text-drop">{l.fehler} fehlgeschlagen</span>}
                      </td>
                      <td className="tnum py-1.5 pr-3 text-right">{l.stellen ? zahl.format(l.stellen) : "–"}</td>
                      <td className="tnum py-1.5 pr-3 text-right text-muted">
                        {l.stellen ? usd(l.bewertungUsd / l.stellen) : "–"}
                      </td>
                      <td className="tnum py-1.5 pr-3 text-right text-muted">{l.sonst || "–"}</td>
                      <td className="tnum py-1.5 text-right font-medium">{usd(l.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card-pad mt-5">
            <h2 className="section-title text-base">Pro Zweck · 30 Tage</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs text-muted [&_th]:bg-subtle/60 [&_th]:px-2">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Zweck</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Aufrufe</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Ø je Aufruf</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Anteil</th>
                  <th className="py-1.5 text-right font-normal">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {zweckListe.map(([zweck, e]) => (
                  <tr key={zweck} className="border-t border-rule/60">
                    <td className="py-1.5 pr-3">
                      {ZWECK[zweck] ?? zweck}
                      {e.suchen > 0 && <span className="ml-2 text-xs text-muted">{zahl.format(e.suchen)} Suchen</span>}
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right">{zahl.format(e.aufrufe)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-muted">{usd(e.usd / e.aufrufe)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-muted">
                      {gesamt30 > 0 ? prozent.format(e.usd / gesamt30) : "–"}
                    </td>
                    <td className="tnum py-1.5 text-right font-medium">{usd(e.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card-pad mt-5">
            <h2 className="section-title text-base">Pro Person · 30 Tage</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-muted [&_th]:bg-subtle/60 [&_th]:px-2">
                  <tr>
                    <th className="py-1.5 pr-3 font-normal">Person</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Stellen bewertet</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Ø Stellen / Tag</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Ø je Stelle</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Kosten</th>
                    <th className="py-1.5 text-right font-normal">pro Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {personListe.map(([profil, p]) => {
                    const tage = Math.max(p.tage.size, 1);
                    return (
                      <tr key={profil} className="border-t border-rule/60">
                        <td className="py-1.5 pr-3 capitalize">{profil}</td>
                        <td className="tnum py-1.5 pr-3 text-right">{zahl.format(p.stellen)}</td>
                        <td className="tnum py-1.5 pr-3 text-right text-muted">{zahl.format(p.stellen / tage)}</td>
                        <td className="tnum py-1.5 pr-3 text-right text-muted">
                          {p.stellen ? usd(p.bewertungUsd / p.stellen) : "–"}
                        </td>
                        <td className="tnum py-1.5 pr-3 text-right font-medium">{usd(p.usd)}</td>
                        <td className="tnum py-1.5 text-right">{usd((p.usd / tage) * 30)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              „pro Monat“ rechnet die Tage mit Aufrufen auf 30 hoch. Wer in einem breiten Berufsfeld sucht,
              bekommt mehr Stellen zur Bewertung — das zeigt sich in „Ø Stellen / Tag“, nicht im Preis je Stelle.
              {cacheAnteil !== null && (
                <> Bei der Bewertung kamen {prozent.format(cacheAnteil)} der Eingabe-Tokens aus dem Cache (zu einem Zehntel des Preises).</>
              )}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
