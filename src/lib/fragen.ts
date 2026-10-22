import { callClaudeJson, DEFAULT_MODEL } from "./claude";
import { loadCv, type Lang } from "./cv-source";

/**
 * Antworten auf Fragen aus Bewerbungsformularen, z. B.
 * "What motivates you to apply, and why does this role feel like a great fit?"
 *
 * Viele Firmen fragen statt eines Anschreibens zwei, drei Sätze ab. Die
 * Antwort entsteht aus Ausschreibung, Lebenslauf (ivergentz.de) und — falls
 * vorhanden — dem Anschreiben-Entwurf, damit alles zusammenpasst.
 */

export type Frage = { frage: string; antwort: string; limit?: number | null; erstellt?: string };

const REGELN = `Du formulierst Antworten auf Fragen aus Online-Bewerbungsformularen für Iver Bohnes (geb. Gentz).

HARTE REGELN:
- Nichts erfinden. Jede Aussage muss aus Lebenslauf oder Ausschreibung belegbar sein.
- Halte dich an die Länge, die die Frage oder das Formular vorgibt ("1–2 sentences", Zeichenlimit). Ohne Vorgabe: höchstens 3 Sätze.
- Antworte in der Sprache der Frage. Englische Frage → Englisch, deutsche Frage → Deutsch.
- Ich-Form, natürlich und direkt, wie ein Mensch, der das selbst tippt. Keine Floskeln ("I am thrilled", "passionate"), keine Aufzählungen, kein Markdown.
- Konkret statt allgemein: eine echte Verbindung zwischen Ivers Erfahrung und genau dieser Firma oder Rolle nennen.
- Iver denkt Produkte ganzheitlich: bauen, verbessern, vermarkten. Nie so klingen, als würde er nur Prototypen bauen.
- Bei Fragen nach Gehalt: den Wert aus dem Hinweis verwenden, falls angegeben, sonst eine neutrale Formulierung vorschlagen und in hinweis darauf hinweisen. Kündigungsfrist: 3 Monate.
- Bei Ja/Nein- oder Faktenfragen (Arbeitserlaubnis, Umzug, Startdatum): kurz und sachlich. Was nicht aus dem Lebenslauf hervorgeht, NICHT raten — in hinweis vermerken, dass Iver das selbst ergänzen muss.

hinweis: ein kurzer Satz auf Deutsch an Iver, falls etwas zu prüfen ist. Sonst leer.`;

const SCHEMA = {
  type: "object",
  properties: {
    antwort: { type: "string" },
    hinweis: { type: "string" },
  },
  required: ["antwort", "hinweis"],
};

export async function beantworteFrage(input: {
  frage: string;
  limit?: number | null;
  lang: Lang;
  title: string;
  employer: string;
  description: string;
  anschreiben?: string;
  gehalt?: string;
}): Promise<{ antwort: string; hinweis: string }> {
  // Lebenslauf in der Sprache der Frage, damit Begriffe passen.
  const englisch = /\b(what|why|how|please|your|you)\b/i.test(input.frage);
  const { cv } = await loadCv(englisch ? "en" : input.lang);

  const result = await callClaudeJson<{ antwort?: string; hinweis?: string }>({
    model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
    system: `${REGELN}\n\nIVERS LEBENSLAUF:\n${JSON.stringify(
      {
        role: cv.role,
        tagline: cv.tagline,
        competencies: cv.competencies,
        experience: cv.experience,
        products: cv.products,
        languages: cv.languages,
      },
      null,
      1
    )}`,
    user: [
      `Stelle: ${input.title}`,
      `Arbeitgeber: ${input.employer}`,
      "",
      "Ausschreibung:",
      input.description.slice(0, 10000),
      "",
      input.anschreiben ? `Bisheriger Anschreiben-Entwurf (zur Abstimmung, nicht wiederholen):\n${input.anschreiben.slice(0, 3000)}\n` : "",
      input.gehalt ? `Gehaltsvorstellung laut Iver: ${input.gehalt}\n` : "",
      `FRAGE AUS DEM FORMULAR:\n${input.frage}`,
      input.limit ? `\nZeichenlimit: ${input.limit} Zeichen — nicht überschreiten.` : "",
    ].join("\n"),
    schema: SCHEMA,
    maxTokens: 2000,
    timeoutMs: 60_000,
  });

  let antwort = (result.antwort ?? "").trim();
  if (input.limit && antwort.length > input.limit) {
    // Notbremse: am letzten Satzende vor dem Limit kürzen.
    const cut = antwort.slice(0, input.limit);
    const ende = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    antwort = ende > 40 ? cut.slice(0, ende + 1) : cut.trim();
  }
  return { antwort, hinweis: (result.hinweis ?? "").trim() };
}
