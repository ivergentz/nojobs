import type { Abruf, BenchProfil, QuellenStatus, Quelle } from "./typen";
import { QUELLEN, QUELLEN_NAME } from "./typen";
import { ertragProAnfrage, type ProfilErgebnis } from "./kennzahlen";
import type { Annahmen, Messwerte, Zeile } from "./hochrechnung";

export type Lauf = {
  modus: "live" | "fixtures";
  gestartet: string;
  dauerSek: number;
  profile: BenchProfil[];
  status: QuellenStatus[];
  abrufe: Abruf[];
  streng: ProfilErgebnis[];
  weit: ProfilErgebnis[];
  messwerte: Messwerte;
  annahmen: Annahmen;
  hochrechnung: Zeile[];
  konfig: Record<string, number>;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf.format(v));
const usd = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} $`);
const anteil = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

function zahlenTabelle(e: ProfilErgebnis, getestet: Record<Quelle, boolean>): string {
  const z = e.quellen;
  const zelle = (q: Quelle, wert: string) => `<td>${getestet[q] ? wert : '<span class="muted">nicht getestet</span>'}</td>`;
  const zeile = (titel: string, f: (q: Quelle) => string) => `<tr><th>${titel}</th>${QUELLEN.map((q) => zelle(q, f(q))).join("")}</tr>`;
  return `<table><tr><th>Kennzahl</th>${QUELLEN.map((q) => `<th>${QUELLEN_NAME[q]}</th>`).join("")}</tr>
  ${zeile("API-Anfragen (Suche)", (q) => `${z[q].anfragen}${z[q].anfragenFehler ? ` (${z[q].anfragenFehler} fehlgeschlagen)` : ""}${z[q].detailAbrufe ? ` + ${z[q].detailAbrufe} Details` : ""}`)}
  ${zeile("Gefundene Anzeigen", (q) => `${n(z[q].anzeigen)}${z[q].anzeigen !== z[q].anzeigenEindeutig ? ` <span class="muted">(${n(z[q].anzeigenEindeutig)} verschiedene)</span>` : ""}`)}
  ${zeile("Eindeutige Stellen", (q) => n(z[q].eindeutig))}
  ${zeile("Überschneidung mit BA", (q) => (q === "ba" ? "—" : `${n(z[q].ueberschneidungBa)} (${anteil(z[q].ueberschneidungBa, z[q].eindeutig)})`))}
  ${zeile("Zusätzlich gegenüber BA", (q) => (q === "ba" ? "—" : n(z[q].zusaetzlich)))}
  ${zeile("davon nach Vorfilter relevant", (q) => (q === "ba" ? "—" : `${n(z[q].zusaetzlichRelevant)} <span class="muted">+ ${n(z[q].zusaetzlichUnklar)} unklar</span>`))}
  ${zeile("Mit Beschreibung (≥ 200 Zeichen)", (q) => (q === "ba" ? `${anteil(z[q].mitBeschreibung, z[q].detailAbrufe)} <span class="muted">der Stichprobe (${z[q].detailAbrufe} Details)</span>` : anteil(z[q].mitBeschreibung, z[q].anzeigenEindeutig)))}
  ${zeile("Mit Gehaltsangabe", (q) => anteil(z[q].mitGehalt, z[q].anzeigenEindeutig))}
  ${zeile("Mit Remote-Information", (q) => anteil(z[q].mitRemoteInfo, z[q].anzeigenEindeutig))}
  ${zeile("Ort passt (Stadt oder remote)", (q) => anteil(z[q].ortPasst, z[q].anzeigenEindeutig))}
  ${zeile("Höchstens 7 Tage alt", (q) => `${anteil(z[q].hoechstens7Tage, z[q].mitDatum)} <span class="muted">(Median ${n(z[q].medianAlterTage)} Tage)</span>`)}
  ${zeile("Direkter Arbeitgeber-Link", (q) => (q === "google" ? anteil(z[q].direkterArbeitgeberLink, z[q].anzeigenEindeutig) : q === "adzuna" ? "nein (Adzuna-Weiterleitung)" : "—"))}
  </table>`;
}

function empfehlung(l: Lauf): string {
  const getestet = Object.fromEntries(l.status.map((s) => [s.quelle, s.getestet])) as Record<Quelle, boolean>;
  const ertrag = (q: "google" | "adzuna") => {
    const werte = l.streng.map((e) => ertragProAnfrage(e, q)).filter((v): v is number => v !== null);
    return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
  };
  const g = ertrag("google");
  const a = ertrag("adzuna");
  const punkte: string[] = [];
  const urteil = (q: "google" | "adzuna", wert: number | null) => {
    if (!getestet[q]) return `${QUELLEN_NAME[q]}: <b>nicht gemessen</b> — keine Aussage möglich.`;
    if (wert === null) return `${QUELLEN_NAME[q]}: keine erfolgreiche Anfrage — keine Aussage möglich.`;
    const stufe = wert >= 3 ? "lohnt sich voraussichtlich" : wert >= 1 ? "lohnt sich eingeschränkt" : "lohnt sich eher nicht";
    return `${QUELLEN_NAME[q]}: ${nf.format(wert)} neue, wahrscheinlich relevante Stellen je Anfrage → <b>${stufe}</b> (Schwellen: ≥ 3 / ≥ 1 je Anfrage, frei gewählt).`;
  };
  punkte.push(urteil("google", g), urteil("adzuna", a));
  if (g !== null && a !== null) punkte.push(`Mehr neue Stellen pro Anfrage: <b>${g >= a ? "Google Jobs" : "Adzuna"}</b>.`);
  return `<ul>${punkte.map((p) => `<li>${p}</li>`).join("")}</ul><p class="muted">Automatisch aus den Messwerten abgeleitet. Die Schwellen sind eine Arbeitsannahme; die endgültige Bewertung gehört in die Auswertung durch einen Menschen.</p>`;
}

export function berichtHtml(l: Lauf): string {
  const getestet = Object.fromEntries(l.status.map((s) => [s.quelle, s.getestet])) as Record<Quelle, boolean>;
  const profilText = l.profile
    .map((p) => `<li><b>${p.id}</b> · ${p.rolle === "admin" ? "Betreiber-Profil (Suche aus dem Code, Hamburg + remote)" : `${esc(p.ort ?? "ohne Ort")}, ${p.umkreis} km`} · ${p.suchbegriffe.length} Suchbegriffe · Arbeitsort: ${esc(p.arbeitsort.join(", ") || "keine Angabe")}${p.nogos.length ? ` · Nogos: ${esc(p.nogos.join(", "))}` : ""}</li>`)
    .join("");
  const fehler = l.abrufe.filter((a) => !a.ok);
  const profilAbschnitte = l.profile
    .map((p) => {
      const s = l.streng.find((e) => e.profil === p.id);
      const w = l.weit.find((e) => e.profil === p.id);
      if (!s || !w) return "";
      const ink = (e: ProfilErgebnis) => `<table><tr><th></th><th>alle</th><th>relevant</th><th>unklar</th></tr>
        ${(
          [
            ["nur Google Jobs", e.inkrement.nurGoogle],
            ["nur Adzuna", e.inkrement.nurAdzuna],
            ["Google + Adzuna, nicht BA", e.inkrement.beideOhneBa],
            ["kombiniert (nicht in BA)", e.inkrement.kombiniert],
          ] as const
        )
          .map(([t, v]) => `<tr><th>${t}</th><td>${v.alle}</td><td>${v.relevant}</td><td>${v.unklar}</td></tr>`)
          .join("")}</table>`;
      const begriffe = s.jeBegriff.slice(0, 10).map((b) => `<li>${esc(b.begriff)}: Google ${b.google} · Adzuna ${b.adzuna}</li>`).join("");
      const plattformen = s.quellen.google.plattformen.map((x) => `${esc(x.name)} (${x.anzahl})`).join(", ");
      return `<section><h3>Profil ${p.id}</h3>
        <p class="muted">Duplikate „streng“ (nur sichere) — ${s.stellen} Stellen insgesamt, ${s.unklarePaare} unklare Paare nicht zusammengeführt.</p>
        ${zahlenTabelle(s, getestet)}
        <h4>Inkrementeller Mehrwert</h4>
        <div class="zwei"><div><p class="muted">streng (nur sichere Duplikate)</p>${ink(s)}</div><div><p class="muted">weit (sichere + wahrscheinliche)</p>${ink(w)}</div></div>
        ${begriffe ? `<h4>Neue relevante Stellen je Suchbegriff</h4><ul>${begriffe}</ul>` : ""}
        ${plattformen ? `<p><b>Google-Jobs-Plattformen:</b> ${plattformen}</p>` : ""}
      </section>`;
    })
    .join("");
  const h = l.hochrechnung
    .map(
      (z) => `<tr><th>${z.profile}</th><td>${z.google.anfragenTag} / ${z.google.anfragenMonat}</td><td>${n(z.google.neuTag)}</td><td>${esc(z.google.stufe)} · ${usd(z.google.usdMonat)}</td>
      <td>${z.adzuna.anfragenTag} / ${z.adzuna.anfragenMonat}</td><td>${n(z.adzuna.neuTag)}</td><td>${z.adzuna.innerhalbFrei ? "im freien Rahmen" : "über Standardgrenze → Absprache nötig"}</td>
      <td>${n(z.kiBewertungenTag)}</td><td>${usd(z.kiUsdMonat)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Jobquellen-Benchmark</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1b;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:24px}h2{font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:32px}h3{font-size:16px;margin-top:24px}h4{font-size:14px;margin:16px 0 4px}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:13px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f4f3ef;font-weight:600}
.muted{color:#666}.warn{background:#fff7e0;border:1px solid #e0b84d;padding:8px 12px}.zwei{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.zwei{grid-template-columns:1fr}}
@media print{body{margin:0}}</style></head><body>
<h1>Jobquellen-Benchmark: BA · Google Jobs · Adzuna</h1>
<p class="muted">Lauf ${esc(l.gestartet)} · Dauer ${l.dauerSek} s · Modus <b>${l.modus === "live" ? "LIVE (echte Abfragen)" : "TESTDATEN (Fixtures, keine echten Ergebnisse)"}</b></p>
${l.modus === "fixtures" ? '<p class="warn">Dieser Bericht beruht auf künstlichen Testdaten. Die Zahlen zeigen nur, dass die Auswertung funktioniert — sie sagen nichts über die echten Quellen aus.</p>' : ""}
<h2>A · Was wirklich abgefragt wurde</h2>
<table><tr><th>Quelle</th><th>Status</th><th>Kontingent</th></tr>${l.status.map((s) => `<tr><td>${QUELLEN_NAME[s.quelle]}</td><td>${s.getestet ? "getestet" : "<b>nicht getestet</b>"} — ${esc(s.grund)}</td><td>${esc(s.kontingent ?? "—")}</td></tr>`).join("")}</table>
<p><b>Profile</b> (nur Suchkriterien, pseudonymisiert):</p><ul>${profilText}</ul>
${fehler.length ? `<p><b>Fehlgeschlagene Abrufe:</b> ${fehler.length}</p><ul>${fehler.slice(0, 20).map((f) => `<li>${QUELLEN_NAME[f.quelle]} · ${f.profil} · ${esc(f.suchbegriff)}: ${esc(f.fehler)}</li>`).join("")}</ul>` : ""}
<h2>B/C · Profilvergleich und Duplikate</h2>${profilAbschnitte}
<h2>D · Kosten und Hochrechnung</h2>
<p>Annahmen: ${l.annahmen.googleProProfilTag} Google-Suchen und ${l.annahmen.adzunaProProfilTag} Adzuna-Aufrufe je Profil und Tag · produktiver Google-Import ${l.annahmen.googleProduktionProTag}/Tag zusätzlich · KI je Bewertung ${usd(l.annahmen.kiUsdProBewertung)} (${esc(l.annahmen.kiQuelle)}).</p>
<p>Gemessen: Google ${n(l.messwerte.google.neuJeAnfrage)} neue nicht ausgeschlossene Stellen je Anfrage, davon ${l.messwerte.google.anteilFrisch === null ? "—" : `${Math.round(l.messwerte.google.anteilFrisch * 100)} %`} ≤ 7 Tage · Adzuna ${n(l.messwerte.adzuna.neuJeAnfrage)} je Anfrage, davon ${l.messwerte.adzuna.anteilFrisch === null ? "—" : `${Math.round(l.messwerte.adzuna.anteilFrisch * 100)} %`} ≤ 7 Tage.</p>
<table><tr><th>Profile</th><th>Google Anfragen Tag / Monat</th><th>Google neu/Tag</th><th>SerpApi-Stufe · Kosten/Monat</th><th>Adzuna Tag / Monat</th><th>Adzuna neu/Tag</th><th>Adzuna-Rahmen</th><th>zusätzl. KI-Bewertungen/Tag</th><th>KI-Kosten/Monat</th></tr>${h}</table>
<p class="muted">„neu/Tag“ = neue, nicht ausgeschlossene Stellen pro Tag (frischer Anteil ÷ 7). Bereits bekannte Stellen werden nicht erneut bewertet. Die Überschneidung Google↔Adzuna ist in der KI-Spalte nicht abgezogen (Obergrenze).</p>
<h2>E · Einschätzung aus den Messwerten</h2>${empfehlung(l)}
<h2>Methodik und Grenzen</h2>
<ul><li>BA wie im produktiven Import: weitere Profile mit Ort und Umkreis, Betreiber-Profil bundesweit mit Hamburg-/Remote-Filter. Beschreibungen nur in einer Stichprobe abgerufen (kostenlos).</li>
<li>Google Jobs: eine Ergebnisseite je Suchbegriff (~10 Anzeigen), Ort „Stadt, Germany“, Umkreis per <code>lrad</code> (nicht immer streng eingehalten).</li>
<li>Adzuna: eine Seite mit bis zu 50 Anzeigen, <code>where</code> + <code>distance</code>, Beschreibungen sind Auszüge, Links führen über Adzuna.</li>
<li>Duplikate: URL, BA-Referenz, Arbeitgeber-Domain, normalisierter Arbeitgeber + Titel + Ort, Beschreibungsähnlichkeit. Nie nur der Titel. Zahlen streng und weit getrennt.</li>
<li>Vorfilter ohne KI: harte Titel-Ausschlüsse wie im Import, Ausland, keine Wortüberschneidung mit Suchbegriffen. Umkreis ohne Geodaten nicht prüfbar → „unklar“, nicht ausgeschlossen.</li>
<li>Abdeckung gilt nur innerhalb der beobachteten Ergebnismenge — keine Aussage über den Gesamtmarkt.</li></ul>
<p class="muted">Grenzwerte dieses Laufs: ${esc(JSON.stringify(l.konfig))}</p>
</body></html>`;
}
