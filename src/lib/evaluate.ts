/**
 * Der Recruiter-Schritt: passt die Stelle zu Ivers Profil und zur Suche
 * (Hamburg oder remote, Richtung (AI) Product)?
 *
 * Das Feld `language` gibt es in der Datenbank noch aus der Zeit mit Norwegen
 * und Schweden. Es wird nicht mehr bewertet und nicht mehr geschrieben.
 */

import { callClaudeJson, DEFAULT_MODEL } from "./claude";

export { DEFAULT_MODEL };

export type Fit = "must_apply" | "worth_reading" | "ignore";

export type Evaluation = {
  fit: Fit;
  confidence: "high" | "medium" | "low";
  summary: string;
  pros: string[];
  cons: string[];
};

const PROFILE = `KANDIDAT: Iver Bohnes (geb. Gentz), wohnt in Hamburg.

Erfahrung:
- Aktuell Produktverantwortung für interne Systeme und KI-Automatisierung im öffentlichen Sektor (VBG Hamburg, seit 2025): KI-gestützte Posteingangsverarbeitung (ca. 800 Eingänge pro Tag) — Use Cases mit Fachbereichen bewertet, On-Premise-Konzept erstellt und vor Entscheidern präsentiert, MVP selbst gebaut. Dazu Telefonieplattform und Teilprojektleitung SharePoint/Teams.
- Davor Produktmanager Global (IT) bei Robert Bosch: interne SaaS-Lösungen, fünf neue internationale Märkte. Product Owner bei Emmora.
- Davor Marketing und Sales am Flughafen Salzburg, danach selbstständig in Marketing und IT.
- Parallel Solo-Gründer mehrerer B2B-SaaS-Produkte (RankBrief, sarahiver.de, WERKRUF). Baut und bootstrappt komplett selbst: Prototyp, MVP, laufende Weiterentwicklung, Pricing, Vermarktung über Ads, Social und Cold Outreach. Stack: Next.js, Supabase, Stripe, Claude API und weitere LLMs im Produkt.

Einordnung der Seniorität: real etwa drei Jahre in Produktrollen plus das eigene Portfolio. Solides Mid-Level bis Senior — NICHT Head of Product, NICHT Director, NICHT disziplinarische Führung mehrerer PMs.

Stärke: denkt Produkte ganzheitlich, von der Idee bis zum Markt, und setzt KI selbst praktisch um. Passt besonders zu Rollen, die KI-Initiativen aufbauen, Use Cases bewerten und selbst Prototypen liefern.

Sprachen: Deutsch Muttersprache, Englisch fließend. Englischsprachige Stellen sind kein Problem.

SUCHE: Hamburg und Umgebung, oder überwiegend remote aus Hamburg. Ziel ist der Wechsel aus dem öffentlichen Dienst in die freie Wirtschaft. Gehaltsziel rund 85.000 € brutto im Jahr.`;

const RULES = `BEWERTUNG "fit":

must_apply — (AI) Produktrolle mit klarer Passung, in Hamburg oder überwiegend remote. Beispiele: Product Owner, Product Manager, AI Product Manager, AI Program Manager, KI-Manager mit Gestaltungsauftrag. Auch Rollen mit anderem Titel, wenn der Kern Produktverantwortung für ein digitales Produkt, eine Plattform oder eine KI-Initiative ist.

worth_reading — angrenzend, aber nicht im Kern. Etwa: Produktrolle mit starkem Branchenwissen als Muss, technische Rolle mit Produktanteil, Beratung mit KI- oder Digitalisierungsfokus ohne Produktverantwortung, Product Marketing.

WICHTIG — interne Systeme zählen als Produktarbeit. Rollen mit Verantwortung für ein INTERNES System oder eine interne Plattform (Microsoft 365, ServiceNow, SAP, Fachanwendung, KI-Plattform) sind mindestens worth_reading, auch wenn der Titel "Applikationsmanager" oder "Systemverantwortlicher" lautet. must_apply, wenn Gestaltungsspielraum dazukommt: Roadmap, Weiterentwicklung, Anforderungsmanagement, Stakeholder-Steuerung.

STANDORT — entscheidend:
- Arbeitsort Hamburg oder Pendelnähe (Norderstedt, Pinneberg, Wedel, Ahrensburg, Lüneburg …): passt.
- Anderer Ort: nur passend, wenn die Anzeige überwiegend Remote erlaubt (etwa 3+ Tage pro Woche oder "remote first"). Sonst ignore, mit Ort als cons.
- Unklar: worth_reading, Standortfrage als cons.

ÖFFENTLICHER DIENST: Iver will in die freie Wirtschaft. Stellen bei Behörden, Körperschaften oder im TVöD/TV-L höchstens worth_reading, als cons vermerken.

GEHALT: Liegt eine Gehaltsangabe deutlich unter 80.000 €, als cons vermerken. Kein Ausschlussgrund.

ignore — alles andere. Insbesondere:
- Reine Entwicklerrollen (Fullstack, Backend, Frontend, ML-Engineer) OHNE Produktverantwortung.
- Reine Data-Analytics- und Data-Science-Rollen. Iver sucht Richtung (AI) Product, nicht Datenanalyse.
- IT-Support, Systemadministration, Netzwerk, Infrastrukturbetrieb ohne Gestaltungsspielraum.
- Vertrieb/Account Management ohne Produktverantwortung.
- Forschung, Promotion, Stellen mit PhD als Anforderung.
- Junior, Trainee, Praktikum, Werkstudent.
- Head of Product und darüber, Director, Leitung mehrerer Produktteams.
- Reine Projektleitung ohne Produkt- oder KI-Bezug (Bau, Beschaffung, Verwaltungsprojekte).
- Zeitarbeit und Personalvermittlung ohne erkennbaren Endkunden: höchstens worth_reading.

Eine KI-Engineering-Rolle in einem Produktteam ist worth_reading, keine ignore — Iver baut selbst mit LLMs.

AUSGABE — Längen sind verbindlich, längere Antworten werden abgeschnitten und sind unbrauchbar:
- summary: HÖCHSTENS 40 Wörter. Zwei Sätze auf Deutsch: was die Rolle ist, warum sie passt oder nicht. Keine Aufzählung der Aufgaben.
- pros und cons: je HÖCHSTENS vier Stichpunkte à HÖCHSTENS 10 Wörter, auf Deutsch, konkret auf diesen Kandidaten bezogen. Keine Allgemeinplätze.
- confidence: low, wenn die Anzeige zu vage ist, um die Rolle einzuordnen.

ASYMMETRIE — die beiden Fehler sind unterschiedlich teuer:
Ein zu großzügiges worth_reading kostet Iver dreißig Sekunden Lesezeit. Ein fälschlich ignoriertes Angebot sieht er nie wieder.
Deshalb: Bei Unsicherheit zwischen ignore und worth_reading immer worth_reading wählen.
Bei der Grenze zwischen worth_reading und must_apply dagegen streng bleiben — must_apply heißt "hierauf bewerbe ich mich diese Woche".

Antworte im vorgegebenen JSON-Format.`;

const SCHEMA = {
  type: "object",
  properties: {
    fit: { type: "string", enum: ["must_apply", "worth_reading", "ignore"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string", description: "Höchstens 40 Wörter, Deutsch." },
    pros: { type: "array", items: { type: "string" } },
    cons: { type: "array", items: { type: "string" } },
  },
  required: ["fit", "confidence", "summary", "pros", "cons"],
};

/**
 * Harte Obergrenze pro Aufruf. Ohne die kann ein einzelner langsamer Request
 * die ganze Serverless-Funktion über das 60-Sekunden-Limit ziehen.
 */
const CALL_TIMEOUT_MS = 25_000;

export async function evaluateAd(input: {
  title: string;
  employer: string;
  place: string;
  homeoffice: string;
  salary: string;
  description: string;
}): Promise<Evaluation> {
  const parsed = await callClaudeJson<Partial<Evaluation>>({
    model: process.env.EVAL_MODEL || DEFAULT_MODEL,
    system: `${PROFILE}\n\n${RULES}`,
    user: [
      `Titel: ${input.title}`,
      `Arbeitgeber: ${input.employer}`,
      `Ort: ${input.place || "unbekannt"}`,
      `Homeoffice laut Jobbörse: ${input.homeoffice || "keine Angabe"}`,
      `Gehalt laut Jobbörse: ${input.salary || "keine Angabe"}`,
      "",
      // Die ersten 6000 Zeichen enthalten praktisch immer Rolle,
      // Aufgaben, Anforderungen und Arbeitsmodell.
      input.description ? input.description.slice(0, 6000) : "(keine Beschreibung verfügbar)",
    ].join("\n"),
    schema: SCHEMA,
    maxTokens: 1500,
    timeoutMs: CALL_TIMEOUT_MS,
  });

  const fits: Fit[] = ["must_apply", "worth_reading", "ignore"];
  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  return {
    // Unbekanntes Urteil: lieber anschauen als lautlos verlieren.
    fit: fits.includes(parsed.fit as Fit) ? (parsed.fit as Fit) : "worth_reading",
    confidence:
      parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    pros: asList(parsed.pros).slice(0, 4),
    cons: asList(parsed.cons).slice(0, 4),
  };
}
