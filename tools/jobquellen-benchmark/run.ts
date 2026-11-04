/**
 * Jobquellen-Benchmark — manuell starten, nie per Cron.
 *
 *   npx tsx tools/jobquellen-benchmark/run.ts --fixtures   Testlauf mit künstlichen Daten (keine Netzwerkaufrufe)
 *   npx tsx tools/jobquellen-benchmark/run.ts              echter Lauf (Schlüssel aus Umgebungsvariablen)
 *   npx tsx tools/jobquellen-benchmark/run.ts --auswerten ergebnis.json   gespeicherten Lauf neu auswerten (offline)
 *
 * Ohne Terminal: GitHub → Actions → „Jobquellen-Benchmark“ → Run workflow.
 *
 * Garantien: keine Datenbank-Schreibzugriffe (nur SELECT auf profiles und api_kosten), keine KI-Aufrufe,
 * keine Mails/Telegram, keine Wiederholungen bei Rate-Limits, Secrets erscheinen nie in Ausgabe oder Dateien.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anfragenJeProfil, ladeKonfig } from "./konfig";
import { bewertungskosten, profileAusDatei, profileAusDatenbank, waehleBegriffe } from "./profile";
import { abfrageAdzuna, abfrageBa, abfrageGoogle, adzunaZuBench, baZuBench, bereinige, googleZuBench, serpKonto } from "./quellen";
import { berechne } from "./kennzahlen";
import { hochrechnen, KI_USD_BEOBACHTET, messwerte, type Annahmen } from "./hochrechnung";
import { berichtHtml, type Lauf } from "./bericht";
import type { Abruf, BenchJob, BenchProfil, QuellenStatus } from "./typen";

const HIER = dirname(fileURLToPath(import.meta.url));

/**
 * Tage bis zum Neustart des SerpApi-Kontingents (inkl. heute) — so viele Nachtläufe braucht der produktive Import noch.
 * SerpApi rechnet ab dem Abschlusstag des Plans, nicht ab Monatsanfang. Ist der Tag bekannt (BENCH_SERPAPI_TAG,
 * steht im SerpApi-Dashboard), wird bis dahin gerechnet; sonst vorsichtig bis Monatsende.
 */
export function restTage(jetzt = new Date(), neustartTag: number | null = null): number {
  const heute = jetzt.getUTCDate();
  if (neustartTag && neustartTag >= 1 && neustartTag <= 28) {
    if (neustartTag > heute) return neustartTag - heute;
    const ende = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() + 1, 0)).getUTCDate();
    return ende - heute + neustartTag;
  }
  const ende = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth() + 1, 0)).getUTCDate();
  return ende - heute + 1;
}

/** Wie viele Google-Suchen darf der Benchmark verbrauchen, ohne dem produktiven Import das Kontingent zu nehmen? */
export function googleErlaubt(uebrig: number, geplant: number, produktionProTag: number, jetzt = new Date(), neustartTag: number | null = null): number {
  const reserve = produktionProTag * restTage(jetzt, neustartTag);
  return Math.max(0, Math.min(geplant, uebrig - reserve));
}

type FixtureDaten = { profile: unknown[]; ba: Record<string, any[]>; google: Record<string, any[]>; adzuna: Record<string, any[]> };

/**
 * Nachauswertung: rechnet einen gespeicherten Lauf (ergebnis.json) mit den aktuellen Regeln neu —
 * ohne einen einzigen API-Aufruf. So lassen sich Regeländerungen an echten Daten prüfen.
 */
function nachauswertung(pfad: string, ausgabe: string) {
  const alt = JSON.parse(readFileSync(pfad, "utf8")) as Lauf & { jobs: BenchJob[] };
  const jetzt = Date.parse(alt.gestartet);
  const streng = alt.profile.map((p) => berechne(p, alt.jobs, alt.abrufe, "streng", jetzt));
  const weit = alt.profile.map((p) => berechne(p, alt.jobs, alt.abrufe, "weit", jetzt));
  const m = messwerte(streng);
  const lauf: Lauf = { ...alt, streng, weit, messwerte: m, hochrechnung: [3, 10, 25].map((n) => hochrechnen(n, m, alt.annahmen)) };
  delete (lauf as Partial<Lauf & { jobs: unknown }>).jobs;
  writeFileSync(join(ausgabe, "bericht.html"), berichtHtml(lauf));
  writeFileSync(join(ausgabe, "ergebnis.json"), JSON.stringify({ ...lauf, jobs: alt.jobs }, null, 1));
  console.log(`Nachauswertung von ${alt.gestartet}: ${alt.jobs.length} Anzeigen → ${join(ausgabe, "bericht.html")}`);
}

async function main() {
  const start = Date.now();
  const nach = process.argv.indexOf("--auswerten");
  if (nach > 0 && process.argv[nach + 1]) {
    const ziel = process.env.BENCH_AUSGABE || join(HIER, "ergebnis");
    mkdirSync(ziel, { recursive: true });
    nachauswertung(process.argv[nach + 1], ziel);
    return;
  }
  const fixtures = process.argv.includes("--fixtures");
  const k = ladeKonfig();
  const ausgabe = process.env.BENCH_AUSGABE || join(HIER, "ergebnis");
  mkdirSync(ausgabe, { recursive: true });
  const log = (...t: unknown[]) => console.log(...t.map((x) => (typeof x === "string" ? bereinige(x) : x)));

  // ---- Profile
  let profile: BenchProfil[];
  let fx: FixtureDaten | null = null;
  if (fixtures) {
    fx = JSON.parse(readFileSync(join(HIER, "fixtures", "daten.json"), "utf8")) as FixtureDaten;
    const tmp = join(ausgabe, ".fixture-profile.json");
    writeFileSync(tmp, JSON.stringify(fx.profile));
    profile = profileAusDatei(tmp, "fixture");
  } else if (process.env.BENCH_PROFILE_DATEI) {
    profile = profileAusDatei(process.env.BENCH_PROFILE_DATEI);
  } else {
    profile = await profileAusDatenbank();
  }
  if (!profile.length) throw new Error("Keine nutzbaren Profile gefunden.");
  log(`Profile: ${profile.map((p) => `${p.id} (${p.rolle}, ${p.suchbegriffe.length} Begriffe)`).join(", ")}`);

  const jobs: BenchJob[] = [];
  const abrufe: Abruf[] = [];
  const status: QuellenStatus[] = [];

  // ---- BA (kostenlos)
  for (const p of profile) {
    const begriffe = waehleBegriffe(p.suchbegriffe, k.proProfil);
    if (fx) {
      for (const b of begriffe) {
        const hits = fx.ba[`${p.id}|${b}`] ?? [];
        abrufe.push({ quelle: "ba", profil: p.id, suchbegriff: b, ok: true, anzeigen: hits.length, fehler: null, kontingent: false, art: "suche" });
        for (const h of hits) jobs.push(baZuBench(h, p, b, typeof h._beschreibung === "string" ? h._beschreibung : null));
      }
      const mitDetail = (fx.ba && Object.entries(fx.ba).filter(([key]) => key.startsWith(`${p.id}|`)).flatMap(([, v]) => v).filter((h: any) => h._beschreibung).length) || 0;
      for (let i = 0; i < mitDetail; i++) abrufe.push({ quelle: "ba", profil: p.id, suchbegriff: "(Detail)", ok: true, anzeigen: 1, fehler: null, kontingent: false, art: "detail" });
    } else {
      const r = await abfrageBa(p, begriffe, k.tage, k.baSeiten, k.baDetails);
      jobs.push(...r.jobs);
      abrufe.push(...r.abrufe);
    }
  }
  const baOk = abrufe.some((a) => a.quelle === "ba" && a.ok && a.art === "suche");
  status.push({ quelle: "ba", getestet: baOk, grund: baOk ? (fixtures ? "Testdaten" : "öffentliche Jobsuche-API (kostenlos)") : "alle Suchanfragen fehlgeschlagen", kontingent: "kein Kontingent" });

  // ---- Google Jobs (SerpApi)
  const gJe = anfragenJeProfil(k.googleMax, profile.length, k.proProfil);
  if (fx) {
    for (const p of profile)
      for (const b of waehleBegriffe(p.suchbegriffe, gJe)) {
        const liste = fx.google[`${p.id}|${b}`] ?? [];
        abrufe.push({ quelle: "google", profil: p.id, suchbegriff: b, ok: true, anzeigen: liste.length, fehler: null, kontingent: true, art: "suche" });
        for (const j of liste) jobs.push(googleZuBench(j, p, b, Date.parse("2026-11-03T12:00:00Z")));
      }
    status.push({ quelle: "google", getestet: true, grund: "Testdaten", kontingent: null });
  } else if (!process.env.SERPAPI_KEY) {
    status.push({ quelle: "google", getestet: false, grund: "kein SERPAPI_KEY vorhanden", kontingent: null });
  } else {
    let konto;
    try {
      konto = await serpKonto(process.env.SERPAPI_KEY);
    } catch (err) {
      konto = null;
      status.push({ quelle: "google", getestet: false, grund: `Kontingent nicht feststellbar (${bereinige(String(err instanceof Error ? err.message : err))}) — keine Suche ausgeführt`, kontingent: null });
    }
    if (konto) {
      const geplant = gJe * profile.length;
      const erlaubt = googleErlaubt(konto.uebrig, geplant, k.googleProduktionProTag, new Date(), k.serpapiNeustartTag);
      const reserve = k.googleProduktionProTag * restTage(new Date(), k.serpapiNeustartTag);
      const kontoText = `Plan ${konto.plan}${konto.proMonat ? ` (${konto.proMonat}/Monat)` : ""} · vorher ${konto.uebrig} übrig · Reserve für den Nachtlauf bis ${k.serpapiNeustartTag ? `zum Neustart am ${k.serpapiNeustartTag}.` : "Monatsende"}: ${reserve}`;
      if (erlaubt <= 0) {
        status.push({ quelle: "google", getestet: false, grund: "Restkontingent reicht nicht neben der Reserve für den produktiven Import — keine Suche ausgeführt", kontingent: kontoText });
      } else {
        const jeProfil = Math.floor(erlaubt / profile.length) || 0;
        let abbruch: string | null = null;
        for (const p of profile) {
          if (abbruch || jeProfil === 0) break;
          const r = await abfrageGoogle(p, waehleBegriffe(p.suchbegriffe, jeProfil), process.env.SERPAPI_KEY);
          jobs.push(...r.jobs);
          abrufe.push(...r.abrufe);
          abbruch = r.abgebrochen;
        }
        const genutzt = abrufe.filter((a) => a.quelle === "google" && a.kontingent).length;
        status.push({
          quelle: "google",
          getestet: genutzt > 0,
          grund: `${genutzt} Suchen (Plan: ${jeProfil} je Profil)${abbruch ? ` · abgebrochen: ${abbruch}` : ""}${erlaubt < geplant ? ` · gekürzt von ${geplant}, um das Kontingent zu schonen` : ""}`,
          kontingent: `${kontoText} · verbraucht: ${genutzt}${konto.proMonat && konto.proMonat <= 250 ? " · Free-Plan: 0 $" : " · im Monatspreis enthalten"}`,
        });
      }
    }
  }

  // ---- Adzuna
  const aJe = anfragenJeProfil(k.adzunaMax, profile.length, k.proProfil);
  if (fx) {
    for (const p of profile)
      for (const b of waehleBegriffe(p.suchbegriffe, aJe)) {
        const liste = fx.adzuna[`${p.id}|${b}`] ?? [];
        abrufe.push({ quelle: "adzuna", profil: p.id, suchbegriff: b, ok: true, anzeigen: liste.length, fehler: null, kontingent: true, art: "suche" });
        for (const j of liste) jobs.push(adzunaZuBench(j, p, b));
      }
    status.push({ quelle: "adzuna", getestet: true, grund: "Testdaten", kontingent: null });
  } else if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    status.push({ quelle: "adzuna", getestet: false, grund: "Zugang fehlt — kostenlosen Schlüssel unter developer.adzuna.com registrieren (App-ID + App-Key)", kontingent: null });
  } else {
    let abbruch: string | null = null;
    for (const p of profile) {
      if (abbruch) break;
      const r = await abfrageAdzuna(p, waehleBegriffe(p.suchbegriffe, aJe), { id: process.env.ADZUNA_APP_ID, key: process.env.ADZUNA_APP_KEY }, k.tage, k.adzunaPauseMs);
      jobs.push(...r.jobs);
      abrufe.push(...r.abrufe);
      abbruch = r.abgebrochen;
    }
    const genutzt = abrufe.filter((a) => a.quelle === "adzuna").length;
    const ok = abrufe.some((a) => a.quelle === "adzuna" && a.ok);
    status.push({ quelle: "adzuna", getestet: ok, grund: `${genutzt} Aufrufe${abbruch ? ` · abgebrochen: ${abbruch}` : ""}`, kontingent: "freier Schlüssel · Standardgrenzen laut Drittquelle 250/Tag, 2.500/Monat" });
  }

  // ---- Auswertung
  const jetzt = fixtures ? Date.parse("2026-11-03T12:00:00Z") : Date.now();
  const streng = profile.map((p) => berechne(p, jobs, abrufe, "streng", jetzt));
  const weit = profile.map((p) => berechne(p, jobs, abrufe, "weit", jetzt));
  const kosten = fixtures ? null : await bewertungskosten();
  const annahmen: Annahmen = {
    googleProProfilTag: 5,
    adzunaProProfilTag: 5,
    googleProduktionProTag: k.googleProduktionProTag,
    kiUsdProBewertung: kosten?.usdProBewertung ?? KI_USD_BEOBACHTET,
    kiQuelle: kosten ? `Mittel aus ${kosten.anzahl} Bewertungen der letzten 30 Tage (api_kosten)` : "Annahme: Beobachtung Quellen-Log 03.11.2026 (30 Bewertungen = 77,32 ¢)",
  };
  const m = messwerte(streng);
  const lauf: Lauf = {
    modus: fixtures ? "fixtures" : "live",
    gestartet: new Date(start).toISOString(),
    dauerSek: Math.round((Date.now() - start) / 1000),
    profile,
    status,
    abrufe,
    streng,
    weit,
    messwerte: m,
    annahmen,
    hochrechnung: [3, 10, 25].map((n) => hochrechnen(n, m, annahmen)),
    konfig: { ...k },
  };
  writeFileSync(join(ausgabe, "bericht.html"), berichtHtml(lauf));
  writeFileSync(join(ausgabe, "ergebnis.json"), JSON.stringify({ ...lauf, jobs }, null, 1));
  log(`Fertig: ${jobs.length} Anzeigen, ${abrufe.length} Abrufe → ${join(ausgabe, "bericht.html")}`);
  for (const s of status) log(`  ${s.quelle}: ${s.getestet ? "getestet" : "NICHT getestet"} — ${s.grund}`);
}

// Nur ausführen, wenn direkt gestartet (nicht beim Import in Tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`Abbruch: ${bereinige(String(err instanceof Error ? err.message : err))}`);
    process.exit(1);
  });
}
