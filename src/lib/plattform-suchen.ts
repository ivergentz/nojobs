/**
 * Suchaufträge auf großen Jobbörsen: fertige Links aus Suchbegriff, Ort und Umkreis.
 * nojobs ruft diese Seiten nie selbst ab — die Person öffnet den Link, speichert dort die Suche
 * als Job-Alarm (täglich/wöchentlich per Mail) und übernimmt gute Treffer über „Stelle hinzufügen“.
 *
 * Die Adressformate legen die Plattformen fest; Stand November 2026. Ändert sich eines, nur hier anpassen.
 */

export type Plattform = { id: string; name: string; url: string; alarm: string };

const nahe = (wert: number, erlaubt: number[]) => erlaubt.reduce((a, b) => (Math.abs(b - wert) < Math.abs(a - wert) ? b : a));
const slug = (s: string) =>
  s
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function plattformLinks(o: { begriff: string; ort: string | null; umkreisKm: number; nurRemote?: boolean; ohneArbeitsagentur?: boolean }): Plattform[] {
  const q = encodeURIComponent(o.begriff.trim());
  const ort = (o.ort ?? "").trim();
  const l = encodeURIComponent(ort);
  const km = Math.max(0, Math.round(o.umkreisKm || 0));
  const meilen = nahe(km / 1.609, [5, 10, 25, 50, 100]);
  const liste: Plattform[] = [
    {
      id: "linkedin",
      name: "LinkedIn",
      url: `https://www.linkedin.com/jobs/search/?keywords=${q}${ort ? `&location=${l}&distance=${meilen}` : ""}${o.nurRemote ? "&f_WT=2" : ""}`,
      alarm: "Oben in der Trefferliste den Schalter „Jobbenachrichtigung“ einschalten und die Häufigkeit wählen.",
    },
    {
      id: "stepstone",
      name: "StepStone",
      url: `https://www.stepstone.de/jobs/${slug(o.begriff) || "jobs"}${ort ? `/in-${slug(ort)}?radius=${nahe(km, [5, 10, 20, 30, 50, 100])}` : ""}`,
      alarm: "„Job-Agent erstellen“ wählen und festlegen, wie oft die Mail kommt.",
    },
    {
      id: "indeed",
      name: "Indeed",
      url: `https://de.indeed.com/jobs?q=${q}${ort ? `&l=${l}&radius=${nahe(km, [0, 5, 10, 15, 25, 35, 50, 100])}` : ""}`,
      alarm: "„Neue Jobs per E-Mail erhalten“ bzw. die Glocke bei der Suche anklicken.",
    },
    {
      id: "xing",
      name: "XING",
      url: `https://www.xing.com/jobs/search?keywords=${q}${ort ? `&location=${l}&radius=${nahe(km, [0, 10, 20, 50, 100, 200])}` : ""}`,
      alarm: "„Suche speichern“ und die Benachrichtigung per E-Mail einschalten.",
    },
  ];
  if (!o.ohneArbeitsagentur) {
    liste.push({
      id: "arbeitsagentur",
      name: "Arbeitsagentur",
      url: `https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=${q}${ort ? `&wo=${l}&umkreis=${nahe(km, [0, 10, 15, 20, 25, 50, 100, 200])}` : ""}`,
      alarm: "Mit Konto anmelden, „Suche speichern“ und den Suchauftrag per E-Mail aktivieren.",
    });
  }
  return liste;
}
