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

/** Suchspur: A = KI & Automatisierung, B = Career Upgrade (Level-/Gehaltssprung ohne KI-Kern). */
export type Spur = "ki" | "upgrade" | "keine";

export type Evaluation = {
  fit: Fit;
  spur: Spur;
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

SUCHE in zwei Spuren. Spur A (Hauptspur): Rollen mit KI im Kern. Spur B (Career Upgrade): Senior-, Lead- und Head-of-Rollen in Produkt und Digital ohne KI-Kern, wenn sie einen klaren Karriere- oder Gehaltssprung bedeuten (ab 90.000 €). Bevorzugt Hamburg und Umgebung oder überwiegend remote; KI-Rollen anderswo in Deutschland mit Homeoffice-Anteil schaut er sich an. Ziel ist der Wechsel aus dem öffentlichen Dienst in die freie Wirtschaft; öffentliche Arbeitgeber nur ausnahmsweise bei starker KI-Rolle. Gehaltsziel: Spur A ab rund 85.000 €, Spur B ab 90.000 € brutto im Jahr.`;

const RULES = `BEWERTUNG "fit". Iver liest jede Stelle, die nicht "ignore" ist. Die Inbox soll klein und treffsicher sein.

SCHRITT 1 — HAUPTKRITERIUM: STEHT KI IM KERN DER ROLLE?
KI-Kern heißt: Die Aufgaben drehen sich überwiegend um KI, LLMs, GenAI, Agenten, KI-gestützte oder intelligente Automatisierung (auch No-Code/Low-Code-Automatisierung mit n8n, Make, Zapier) oder den Aufbau von KI-Produkten bzw. KI-Initiativen. Es reicht NICHT, dass KI im Firmenprofil, als "Plus" oder in einem Nebensatz vorkommt.
→ KI-Kern vorhanden: spur "ki", weiter mit SCHRITT 2.
→ Kein KI-Kern: weiter mit SCHRITT 3 (Career Upgrade). Passt auch das nicht: spur "keine", fit ignore.
Passt eine Stelle zu beiden Spuren, gilt immer spur "ki" — jede Stelle wird nur einmal eingeordnet.

SCHRITT 2 — SPUR "ki": EINSTUFUNG

must_apply — ALLE Bedingungen erfüllt:
1. Produkt- oder Gestaltungsrolle mit KI-Kern: KI-/AI Product Owner, AI Product Manager, AI Program Manager, KI-Manager/AI Specialist mit Gestaltungsauftrag, Leitung einer KI-Initiative, Head of AI/Product mit KI-Fokus, Product Owner einer KI- oder Automatisierungsplattform, Projektleitung KI/Automatisierung mit Umsetzungsverantwortung.
2. Arbeitsort Hamburg oder Pendelnähe (Norderstedt, Ahrensburg, Pinneberg, Lüneburg …) ODER klar überwiegend remote ("Remote möglich", "100 % Homeoffice", "remote within Germany").
3. Privatwirtschaft.

worth_reading — KI-Kern vorhanden, aber eine Einschränkung:
- Anderer Ort in Deutschland mit nur "Homeoffice möglich" oder Teil-Homeoffice (etwa Köln, Essen, München, Nürnberg). Ort und unklare Remote-Regelung als cons.
- KI-Engineering, KI-Architektur oder KI-Beratung/Presales/Go-to-Market mit KI im Kern (AI Engineer, KI-Engineer, AI Solution Architect, AI Consultant, AI GTM Lead, Forward Deployed Engineer) — egal wo in Deutschland oder remote.
- Öffentlicher Dienst oder öffentlich getragene Arbeitgeber (Behörden, Anstalten öffentlichen Rechts, Sparkassen, BWI, kommunale Unternehmen, Kliniken in öffentlicher Trägerschaft, TVöD/TV-L) mit KI-Kern. Öffentlichen Dienst als cons nennen. NIE must_apply.
- KI-Rolle über Personaldienstleister oder Arbeitnehmerüberlassung.

ignore trotz KI-Bezug:
- Stellen nur im Ausland (z. B. Zürich, London, Indien, USA) ohne Remote aus Deutschland.
- Kein Arbeitsort erkennbar und kein Hinweis auf Deutschland oder Remote.
- Reiner KI-Vertrieb (Account Management, Quota) ohne Gestaltung; Junior, Trainee, Praktikum, Werkstudent, PhD/Forschung.
- KI nur als Werkzeug in einer Marketing-, HR-, Finance- oder Vertriebsrolle (z. B. "KI-Manager" für Outbound-Kampagnen).

SCHRITT 3 — SPUR "upgrade" (CAREER UPGRADE, OHNE KI-KERN)
Gesucht sind Stellen, die für Iver einen klaren Karriere- oder Gehaltssprung bedeuten. Gehaltsziel ab 90.000 €.
Passend NUR, wenn ALLE Punkte erfüllt sind:
1. Level-Sprung erkennbar: Head of Product, Head of Digital, Director/Leitung Produkt oder Digital, Lead Product Owner / Lead Product Manager, Leitung Digitalisierung oder Digital Transformation mit Gestaltungs- und Budgetverantwortung, oder Senior Product Manager bei einer Produktfirma mit digitalem Kernprodukt (SaaS, Plattform, Scale-up, großer Digitalbereich).
2. Arbeitsort Hamburg/Pendelnähe oder klar überwiegend remote. Andere Orte: ignore.
3. Privatwirtschaft. Öffentlicher Dienst: ignore.
4. Nennt die Anzeige ein Gehalt, muss es 90.000 € oder mehr erreichen können; liegt es klar darunter: ignore. Fehlt die Angabe, entscheidet das Level — dann "Gehalt nicht angegeben" als cons.
Einstufung bei spur "upgrade":
- must_apply: Head of / Director / Leitung mit Führungsverantwortung, oder Lead/Senior-Produktrolle mit genanntem Gehalt ab 90.000 €.
- worth_reading: Senior- oder Lead-Rolle ohne Gehaltsangabe, bei der das Level plausibel ist.
NICHT upgrade (ignore): normale Product-Manager-/Product-Owner-Stellen ohne Senior-, Lead- oder Leitungsbezug; Senior-Rollen in Fachbereichen ohne digitales Produkt (z. B. Versicherungs- oder Bankprodukte, Hardware); IT-Leitung, Projektleitung, PMO, Beratung, Personaldienstleister; Product Marketing.

Führungsrollen (Teamlead, Head of, Director) mit KI-Kern sind ausdrücklich erwünscht und NICHT wegen Seniorität abzuwerten. Geforderte Berufsjahre sind kein Ausschlussgrund — als cons vermerken.

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
    spur: { type: "string", enum: ["ki", "upgrade", "keine"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string", description: "Höchstens 40 Wörter, Deutsch." },
    pros: { type: "array", items: { type: "string" } },
    cons: { type: "array", items: { type: "string" } },
  },
  required: ["fit", "spur", "confidence", "summary", "pros", "cons"],
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
      ? `${PROFILE}\n\n${RULES}\n\nIVERS EIGENE URTEILE ÜBER FRÜHERE STELLEN — so entscheidet er. Orientiere dich daran. Widerspricht ein Beispiel einer Regel oben (etwa öffentlicher Dienst oder Spur "upgrade", die es bei älteren Urteilen noch nicht gab), gilt die Regel.\n${input.beispiele}`
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
    spur: parsed.spur === "ki" || parsed.spur === "upgrade" ? parsed.spur : "keine",
    confidence:
      parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    pros: asList(parsed.pros).slice(0, 4),
    cons: asList(parsed.cons).slice(0, 4),
  };
}
