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

Einordnung der Seniorität: rund drei Jahre in Produktrollen plus das eigene Portfolio, davor zehn Jahre Business und Marketing. Iver ist ausdrücklich offen für Führungsrollen (Teamlead, Head of, Director) im Produkt-, KI- oder Digitalbereich.

Stärke: denkt Produkte ganzheitlich, von der Idee bis zum Markt, und setzt KI selbst praktisch um. Passt besonders zu Rollen, die KI-Initiativen aufbauen, Use Cases bewerten und selbst Prototypen liefern.

Sprachen: Deutsch Muttersprache, Englisch fließend. Englischsprachige Stellen sind kein Problem.

SUCHE: Hamburg und Umgebung, oder überwiegend remote aus Hamburg. Für eine wirklich herausragende Stelle käme auch ein anderer Ort in Frage. Ziel ist der Wechsel aus dem öffentlichen Dienst in die freie Wirtschaft — öffentlicher Dienst kommt nicht in Frage. Gehaltsziel rund 85.000 € brutto im Jahr.`;

const RULES = `BEWERTUNG "fit". Iver liest jede Stelle, die nicht "ignore" ist. Die Inbox soll klein und treffsicher sein — Rauschen ist hier der Hauptfehler.

must_apply — Iver würde sich diese Woche bewerben. ALLE Bedingungen erfüllt:
1. Kern der Rolle ist Produktverantwortung oder Leitung einer KI-/Digital-Initiative: Product Owner, Product Manager, AI Product Manager, AI Program Manager, KI-Manager mit Gestaltungsauftrag, Head of Product/AI/Digital, Teamlead Produkt. Verantwortung für eine interne Plattform oder Fachanwendung zählt, wenn Roadmap und Weiterentwicklung dazugehören.
2. Arbeitsort Hamburg/Pendelnähe ODER überwiegend remote (etwa 3+ Tage pro Woche).
3. Privatwirtschaft.

ORT UNBEKANNT: Nennt die Anzeige keinen Arbeitsort und keinen Hinweis auf Hamburg oder Remote in Deutschland, ist die Stelle ignore. Stellen nur im Ausland (z. B. London, Indien, USA) sind immer ignore.

worth_reading — NUR in diesen Fällen:
- Rolle erfüllt Bedingung 1 und 3, aber der Ort passt nicht (anderer Ort, kein Remote) — Ort als cons.
- Rolle erfüllt 2 und 3, ist aber nur nah dran: Produktrolle mit sehr speziellem Branchen-Muss, KI-Beratung mit Umsetzungsverantwortung, Digitalisierungsrolle mit klarem Gestaltungsauftrag, KI-Engineering in einem Produktteam.
Im Zweifel zwischen worth_reading und ignore: ignore, außer KI oder Produktverantwortung stehen ausdrücklich im Kern der Aufgaben.

ignore — insbesondere:
- ÖFFENTLICHER DIENST jeder Art: Behörden, Kommunen und kommunale Unternehmen (Stadtwerke, Wasser, Verkehrsbetriebe), Sparkassen, Körperschaften, Bundeswehr-IT (BWI), Unikliniken, Stellen nach TVöD/TV-L/TV-V. Immer ignore.
- Vertrieb, Account Management, Presales, Go-to-Market ohne Produktverantwortung.
- Klassisches Marketing (Brand, Media, Kampagnen, Messen), auch "Product Marketing" ohne Produktverantwortung.
- Reine Entwicklerrollen, Data Analytics, Data Science, Data Engineering, BI.
- IT-Betrieb, Support, Administration, SAP-Customizing ohne Produktrolle.
- Projektleitung ohne Produkt- oder KI-Bezug (Bau, Beschaffung, ERP-Rollout, Verwaltung).
- HR, Finance, Einkauf, Recht — auch wenn "Digital" oder "Transformation" im Titel steht.
- Junior, Trainee, Praktikum, Werkstudent; Forschung und PhD-Stellen.
- Personalvermittler ohne erkennbaren Endkunden, wenn die Rolle selbst nicht klar must_apply wäre.

Führungsrollen (Teamlead, Head of, Director) im Produkt-, KI- oder Digitalbereich sind ausdrücklich erwünscht und NICHT wegen Seniorität abzuwerten.

GEHALT: Liegt eine Angabe deutlich unter 80.000 €, als cons vermerken. Kein Ausschlussgrund.

AUSGABE:
- summary: HÖCHSTENS 40 Wörter. Zwei Sätze auf Deutsch: was die Rolle ist, warum sie passt oder nicht.
- pros und cons: je HÖCHSTENS vier Stichpunkte à HÖCHSTENS 10 Wörter, auf Deutsch, konkret auf Iver bezogen.
- confidence: low, wenn die Anzeige zu vage ist, um die Rolle einzuordnen.

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
  /** Ivers eigene Urteile als Beispiele (siehe run-evaluate.ts). */
  beispiele?: string;
}): Promise<Evaluation> {
  const parsed = await callClaudeJson<Partial<Evaluation>>({
    model: process.env.EVAL_MODEL || DEFAULT_MODEL,
    system: input.beispiele
      ? `${PROFILE}\n\n${RULES}\n\nIVERS EIGENE URTEILE ÜBER FRÜHERE STELLEN — so entscheidet er. Orientiere dich daran. Widerspricht ein Beispiel einer Regel oben (etwa öffentlicher Dienst), gilt die Regel.\n${input.beispiele}`
      : `${PROFILE}\n\n${RULES}`,
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
