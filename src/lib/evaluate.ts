/**
 * Der Recruiter-Schritt.
 *
 * Zwei Urteile, bewusst getrennt:
 *   fit       — passt der Inhalt zu Ivers Profil?
 *   language  — ist die Stelle ohne Skandinavisch machbar?
 *
 * Die Trennung ist wichtig, weil sieben von zehn seiner bisherigen Favoriten
 * inhaltlich passten, aber norwegischsprachig waren. Würde das Modell nur ein
 * Urteil fällen, ginge die Information verloren, wie viel Markt ein Sprachkurs
 * öffnen würde.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type Fit = "must_apply" | "worth_reading" | "ignore";
export type Language = "english_ok" | "scandinavian_required" | "unclear";

export type Evaluation = {
  fit: Fit;
  language: Language;
  confidence: "high" | "medium" | "low";
  summary: string;
  pros: string[];
  cons: string[];
};

const PROFILE = `KANDIDAT: Iver Bohnes, Hamburg. EU-Bürger, keine Visumsfragen im EWR.

Erfahrung:
- Aktuell Produktverantwortung für interne Systeme im öffentlichen Sektor (VBG Hamburg): unternehmensweite Telefonieplattform, automatisierte Belegerfassung, KI-gestützte Verschlagwortung im Posteingang, Teilprojektleitung SharePoint/Teams-Rollout.
- Davor Product Manager bei Robert Bosch (1 Jahr), Product Owner bei Emmora (7 Monate).
- Davor Marketing und Sales am Flughafen Salzburg, danach freiberuflich.
- Parallel Solo-Gründer von drei live betriebenen B2B-SaaS-Produkten: RankBrief (automatisiertes SEO-Reporting), sarahiver.de (mandantenfähige Hochzeitswebseiten), WERKRUF (lokales SEO für Handwerk). Baut komplett selbst: Next.js, Supabase, Stripe, LLM-Integration, Pricing, Go-to-Market.

Einordnung der Seniorität: real etwa drei Jahre in Produktrollen plus das eigene Portfolio. Also solides Mid-Level bis unteres Senior — NICHT Head of Product, NICHT Director, NICHT Führung mehrerer PMs.

Alleinstellungsmerkmal: baut B2B-SaaS allein, von Pricing bis Deployment, mit LLMs im Produkt. Das ist der Grund, warum kleine Teams (20-500 Mitarbeitende) besser passen als Konzerne mit spezialisierten Produktrollen.

Sprachen: Deutsch Muttersprache, Englisch fließend. KEIN Norwegisch, Dänisch, Schwedisch oder Niederländisch.

Zielmarkt: Norwegen, Schweden, Dänemark, Niederlande. Umzug in den nächsten 2-5 Jahren geplant.`;

const RULES = `BEWERTUNG "fit" — nur Inhalt, Sprache wird separat bewertet.

must_apply — (AI) Produktrolle mit klarer Passung. Beispiele: Product Owner, Produktleder, Produktsjef, Product Manager, AI Product Lead. Auch Rollen mit anderem Titel, wenn der Kern Produktverantwortung für ein digitales Produkt oder eine Plattform ist. Digitalisierungs- und KI-Rådgiver-Rollen mit Gestaltungsauftrag zählen dazu.

worth_reading — angrenzend, aber nicht im Kern. Etwa: Produktrolle mit starkem Branchenwissen als Muss, technische Rolle mit Produktanteil, Beratung mit Digitalisierungsfokus ohne Produktverantwortung.

ignore — alles andere. Insbesondere:
- Reine Entwicklerrollen (Fullstack, Backend, Frontend, Plattformingenieur) OHNE Produktverantwortung.
- Reine Data-Analytics- und Data-Science-Rollen. Iver sucht ausdrücklich Richtung (AI) Product, nicht Datenanalyse — das steht auch nicht in seinem CV.
- IT-Support, Systemadministration, Netzwerk, Infrastrukturbetrieb.
- Forschung, Doktorandenstellen, Postdoc.
- Junior, Trainee, Praktikum, Lehre.
- Head of Product und darüber, Director, Leitung mehrerer Produktteams.
- Reine Projektleitung ohne Produktverantwortung (Bau, Beschaffung, Verwaltungsprojekte).

Eine KI-Engineering-Rolle in einem Produktteam ist worth_reading, keine ignore — Iver baut selbst mit LLMs.

BEWERTUNG "language":

english_ok — Anzeige auf Englisch verfasst, ODER Arbeitssprache ausdrücklich Englisch, ODER international aufgestelltes Produktteam ohne Sprachanforderung im Text.
scandinavian_required — Anzeige verlangt Norwegisch, Dänisch, Schwedisch oder eine skandinavische Sprache, in Wort oder Schrift. Gilt auch ohne ausdrückliche Forderung, wenn es sich um Kommune, Fylkeskommune, Region, Direktorat, Ministerium, Polizei, Gesundheitswesen oder eine andere Verwaltungsstelle mit Bürgerkontakt handelt — dort ist die Landessprache faktisch Voraussetzung.
unclear — norwegisch-, dänisch- oder schwedischsprachige Anzeige eines privaten Unternehmens ohne erkennbare Sprachanforderung.

Die Sprachbewertung ist unabhängig vom fit. Eine perfekt passende Stelle bei einer norwegischen Kommune bekommt fit=must_apply UND language=scandinavian_required.

AUSGABE — Längen sind verbindlich, längere Antworten werden abgeschnitten und sind unbrauchbar:
- summary: HÖCHSTENS 40 Wörter. Zwei Sätze auf Deutsch: was die Rolle ist, warum sie passt oder nicht. Keine Aufzählung der Aufgaben, keine Wiederholung des Anzeigentexts.
- pros und cons: je HÖCHSTENS vier Stichpunkte à HÖCHSTENS 10 Wörter, auf Deutsch, konkret auf diesen Kandidaten bezogen. Keine Allgemeinplätze, keine ganzen Sätze.
- confidence: low, wenn die Anzeige zu vage ist, um die Rolle einzuordnen.

Sei streng. Lieber ein worth_reading zu viel als ein must_apply, das keins ist — must_apply heißt "hierauf bewerbe ich mich diese Woche", nicht "das ist interessant".

Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Fences und ohne Vorrede:
{"fit": "must_apply"|"worth_reading"|"ignore", "language": "english_ok"|"scandinavian_required"|"unclear", "confidence": "high"|"medium"|"low", "summary": string, "pros": string[], "cons": string[]}`;

/**
 * Harte Obergrenze pro Aufruf. Ohne die kann ein einzelner langsamer Request
 * die ganze Serverless-Funktion über das 60-Sekunden-Limit ziehen und alle
 * parallel laufenden Bewertungen mitreißen.
 */
const CALL_TIMEOUT_MS = 28_000;

/**
 * Robustes Parsen der Modellantwort.
 *
 * Drei Dinge gehen in der Praxis schief: Markdown-Fences um das JSON,
 * Vorrede vor der öffnenden Klammer, und rohe Zeilenumbrüche innerhalb von
 * String-Werten — letztere sind in JSON nicht erlaubt und lassen JSON.parse
 * scheitern, obwohl die Antwort inhaltlich vollständig ist.
 */
function parseVerdict(raw: string): Partial<Evaluation> | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  // Nur den Teil zwischen erster und letzter geschweifter Klammer nehmen.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = trimmed.slice(start, end + 1);

  const attempts = [
    candidate,
    // Rohe Steuerzeichen in String-Werten maskieren.
    candidate.replace(/[\u0000-\u001f]/g, (char) =>
      char === "\n" ? "\\n" : char === "\t" ? "\\t" : ""
    ),
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as Partial<Evaluation>;
    } catch {
      /* nächster Versuch */
    }
  }

  return null;
}

export async function evaluateAd(input: {
  title: string;
  employer: string;
  place: string;
  category: string;
  description: string;
}): Promise<Evaluation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen.");
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      signal: abort.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
      model: process.env.EVAL_MODEL ?? "claude-sonnet-5",
      max_tokens: 1500,
      system: `${PROFILE}\n\n${RULES}`,
      messages: [
        {
          role: "user",
          content: [
            `Titel: ${input.title}`,
            `Arbeitgeber: ${input.employer}`,
            `Ort: ${input.place}`,
            `Kategorie: ${input.category}`,
            "",
            // Gekürzt: die ersten 4000 Zeichen enthalten praktisch immer Rolle,
            // Aufgaben und Anforderungen. Der Rest ist Benefits und Bewerbungsweg.
            input.description.slice(0, 4000),
          ].join("\n"),
        },
        // Vorbelegte Antwort: das Modell kann gar nicht erst mit Vorrede
        // beginnen und muss das Objekt fortsetzen.
        { role: "assistant", content: "{" },
      ],
    }),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Zeitüberschreitung nach ${CALL_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };

  const raw =
    "{" +
    (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

  const parsed = parseVerdict(raw);

  if (!parsed) {
    // stop_reason sagt eindeutig, ob die Antwort am Token-Limit endete oder
    // aus einem anderen Grund unbrauchbar ist. Vorher war das Raten.
    const reason = data.stop_reason ?? "unbekannt";
    const head = raw.slice(0, 200);
    const tail = raw.slice(-200);
    throw new Error(
      `Kein gültiges JSON (stop_reason: ${reason}, ${raw.length} Zeichen). ` +
        `Anfang: ${head} ||| Ende: ${tail}`
    );
  }

  const fits: Fit[] = ["must_apply", "worth_reading", "ignore"];
  const languages: Language[] = ["english_ok", "scandinavian_required", "unclear"];
  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  return {
    fit: fits.includes(parsed.fit as Fit) ? (parsed.fit as Fit) : "ignore",
    language: languages.includes(parsed.language as Language)
      ? (parsed.language as Language)
      : "unclear",
    confidence:
      parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    pros: asList(parsed.pros).slice(0, 4),
    cons: asList(parsed.cons).slice(0, 4),
  };
}
