import { callClaudeJson, callClaudeRecherche, DEFAULT_MODEL, type Quelle } from "./claude";
import type { KostenKontext } from "./kosten";
import { loadCv } from "./cv-source";

/**
 * Gesprächsvorbereitung für eine Bewerbung — höchstens zwei A4-Seiten.
 *
 * Entsteht automatisch, sobald eine Stelle auf "Beworben" gesetzt wird
 * (api/status), und lässt sich auf der Unterlagen-Seite neu erzeugen und als
 * PDF laden. Grundlage: Ausschreibung, Lebenslauf (ivergentz.de) und — falls
 * vorhanden — der Anschreiben-Entwurf, damit Gespräch und Unterlagen dieselbe
 * Geschichte erzählen.
 *
 * Unternehmen: Vorab recherchiert Claude mit der Websuche (bis zu 4 Suchen) —
 * Geschäft, Größe, aktuelle Nachrichten, KI-/Digitalthemen. Schlägt die Suche
 * fehl (z. B. in der Console deaktiviert), entsteht das Briefing trotzdem, dann
 * nur aus Anzeige und allgemeinem Wissen mit "(prüfen)"-Markierungen.
 */

export type Vorbereitung = {
  unternehmen: { kurz: string; fakten: string[] };
  rolle: { kern: string; aufgaben: string[]; worauf_es_ankommt: string[] };
  fit: { staerken: Array<{ punkt: string; beleg: string }>; luecken: Array<{ punkt: string; antwort: string }> };
  pitch: string;
  beispiele: Array<{ titel: string; situation: string; vorgehen: string; ergebnis: string }>;
  fragen_an_dich: Array<{ frage: string; antwortskizze: string }>;
  fragen_an_sie: string[];
  gehalt: string;
  /** Webquellen der Unternehmensrecherche. Leer = ohne Websuche erstellt. */
  quellen?: Quelle[];
  erstellt?: string;
};

const REGELN = `Du bereitest Iver Bohnes (geb. Gentz) auf ein Bewerbungsgespräch vor. Ergebnis: ein kompaktes Briefing, das auf ZWEI A4-Seiten passt. Sprache: Deutsch, Du-Form, direkt und konkret.

HARTE REGELN:
- Nichts über Iver erfinden. Jede Aussage über ihn muss aus dem Lebenslauf (oder dem Anschreiben-Entwurf) belegbar sein. Zahlen nur, wenn sie dort stehen.
- Über das Unternehmen: Nutze vor allem die WEB-RECHERCHE (aktuell, mit Quellen), dazu die Anzeige. Was weder dort noch in der Anzeige steht und du nicht sicher weißt, mit "(prüfen)" kennzeichnen. Keine erfundenen Zahlen, Personen oder Projekte. Aktuelle Nachrichten aus der Recherche sind gute Gesprächsaufhänger — einen davon in fakten aufnehmen, wenn vorhanden.
- Knapp: Stichpunkte höchstens 20 Wörter, Absätze höchstens 3 Sätze. Lieber weniger, aber treffend.
- Lücken ehrlich benennen (z. B. fehlendes Studium, fehlende Branchenerfahrung, fehlende Skalierungserfahrung) und jeweils eine ehrliche, kurze Antwort vorschlagen, die zur Stärke zurückführt. Nie beschönigen.
- Wiederkehrende Schwachstellen aus früheren Absagen: Bei KI-Bot- oder Konzernrollen wurde "Produktverantwortung im Livebetrieb" und "Skalierung" vermisst — darauf vorbereitende Antworten geben, wenn die Rolle das verlangt.
- Fragen an das Unternehmen: konkret zu dieser Rolle, keine Allerweltsfragen. Die letzte Frage zum weiteren Prozess.
- Gehalt: kurze Einschätzung für diese Rolle und eine Empfehlung, wie Iver das Thema anspricht. Sein Ziel ist der Wert im Hinweis (sonst rund 85.000 € brutto/Jahr); Kündigungsfrist 3 Monate. Bei Tarifbindung: nach Entgeltgruppe bzw. AT fragen.

UMFANG (Obergrenzen):
- unternehmen.kurz: 2–3 Sätze. fakten: 3–5.
- rolle.kern: 1–2 Sätze. aufgaben: 3–5. worauf_es_ankommt: 3 (was sie wirklich suchen, zwischen den Zeilen).
- fit.staerken: 3–4 mit Beleg aus dem Lebenslauf. fit.luecken: 2–3 mit Antwortvorschlag.
- pitch: 60-Sekunden-Vorstellung, 4–6 Sätze, auf diese Stelle zugeschnitten.
- beispiele: 2–3 Situationen aus dem Lebenslauf (Situation, Vorgehen, Ergebnis — Ergebnis mit Zahl, wenn vorhanden).
- fragen_an_dich: 6 wahrscheinliche Fragen mit Antwortskizze (1–2 Sätze).
- fragen_an_sie: 4–5.`;

const SCHEMA = {
  type: "object",
  properties: {
    unternehmen: {
      type: "object",
      properties: { kurz: { type: "string" }, fakten: { type: "array", items: { type: "string" } } },
      required: ["kurz", "fakten"],
    },
    rolle: {
      type: "object",
      properties: {
        kern: { type: "string" },
        aufgaben: { type: "array", items: { type: "string" } },
        worauf_es_ankommt: { type: "array", items: { type: "string" } },
      },
      required: ["kern", "aufgaben", "worauf_es_ankommt"],
    },
    fit: {
      type: "object",
      properties: {
        staerken: {
          type: "array",
          items: {
            type: "object",
            properties: { punkt: { type: "string" }, beleg: { type: "string" } },
            required: ["punkt", "beleg"],
          },
        },
        luecken: {
          type: "array",
          items: {
            type: "object",
            properties: { punkt: { type: "string" }, antwort: { type: "string" } },
            required: ["punkt", "antwort"],
          },
        },
      },
      required: ["staerken", "luecken"],
    },
    pitch: { type: "string" },
    beispiele: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titel: { type: "string" },
          situation: { type: "string" },
          vorgehen: { type: "string" },
          ergebnis: { type: "string" },
        },
        required: ["titel", "situation", "vorgehen", "ergebnis"],
      },
    },
    fragen_an_dich: {
      type: "array",
      items: {
        type: "object",
        properties: { frage: { type: "string" }, antwortskizze: { type: "string" } },
        required: ["frage", "antwortskizze"],
      },
    },
    fragen_an_sie: { type: "array", items: { type: "string" } },
    gehalt: { type: "string" },
  },
  required: ["unternehmen", "rolle", "fit", "pitch", "beispiele", "fragen_an_dich", "fragen_an_sie", "gehalt"],
};

const liste = <T>(value: unknown, max: number): T[] => (Array.isArray(value) ? (value as T[]).slice(0, max) : []);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function erstelleVorbereitung(input: {
  title: string;
  employer: string;
  place: string;
  description: string;
  anschreiben?: string;
  gehalt?: string;
  /** Anlass und Stelle für die Kostentabelle; der Zweck wird hier gesetzt. */
  kosten?: Omit<KostenKontext, "zweck">;
}): Promise<Vorbereitung> {
  const { cv } = await loadCv("de");

  // 1. Unternehmensrecherche im Web — darf scheitern, dann ohne.
  let recherche: { text: string; quellen: Quelle[] } = { text: "", quellen: [] };
  if (input.employer) {
    try {
      recherche = await callClaudeRecherche({
        model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
        maxSearches: 4,
        maxTokens: 1500,
        timeoutMs: 75_000,
        kosten: { ...input.kosten, zweck: "recherche" },
        prompt: [
          `Recherchiere für eine Gesprächsvorbereitung zum Arbeitgeber "${input.employer}" (Stelle: ${input.title}${input.place ? `, ${input.place}` : ""}).`,
          "Gesucht, soweit auffindbar: was das Unternehmen macht, Größe und Konzernzugehörigkeit, Standorte, aktuelle Nachrichten der letzten 12 Monate, Digitalisierungs- und KI-Initiativen, Tarifbindung oder Gehaltsinfos, Kultur (z. B. Arbeitgeberbewertungen).",
          "Höchstens 4 Suchen. Antworte auf Deutsch in knappen Stichpunkten, insgesamt höchstens 250 Wörter, nur mit Fakten aus den Quellen. Was du nicht findest, lässt du weg.",
        ].join("\n"),
      });
    } catch {
      recherche = { text: "", quellen: [] };
    }
  }

  // 2. Briefing als strukturiertes JSON.
  const roh = await callClaudeJson<Partial<Vorbereitung>>({
    model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
    system: `${REGELN}\n\nIVERS LEBENSLAUF:\n${JSON.stringify({
      role: cv.role,
      tagline: cv.tagline,
      competencies: cv.competencies,
      experience: cv.experience,
      products: cv.products,
      education: cv.education,
      languages: cv.languages,
    })}`,
    user: [
      `Stelle: ${input.title}`,
      `Unternehmen: ${input.employer}`,
      `Ort: ${input.place || "unbekannt"}`,
      input.gehalt ? `Hinweis Gehaltsziel: ${input.gehalt}` : "",
      recherche.text ? `\nWEB-RECHERCHE ZUM UNTERNEHMEN (aktuell):\n${recherche.text.slice(0, 4000)}` : "\n(Keine Web-Recherche verfügbar — Unternehmensangaben nur aus Anzeige und allgemeinem Wissen, unsicheres mit \"(prüfen)\".)",
      input.anschreiben ? `\nAnschreiben-Entwurf (so hat Iver sich präsentiert):\n${input.anschreiben.slice(0, 3000)}` : "",
      "",
      "Ausschreibung:",
      input.description ? input.description.slice(0, 10000) : "(keine Beschreibung verfügbar — Briefing aus Titel und Unternehmen ableiten und das kennzeichnen)",
    ]
      .filter((zeile) => zeile !== "")
      .join("\n"),
    schema: SCHEMA,
    // Deutsches Briefing mit Recherche braucht oft mehr als 5.000 Tokens — vorher brach es dann ab.
    maxTokens: 12_000,
    timeoutMs: 150_000,
    kosten: { ...input.kosten, zweck: "vorbereitung" },
  });

  const u = (roh.unternehmen ?? {}) as Partial<Vorbereitung["unternehmen"]>;
  const r = (roh.rolle ?? {}) as Partial<Vorbereitung["rolle"]>;
  const f = (roh.fit ?? {}) as Partial<Vorbereitung["fit"]>;

  return {
    unternehmen: { kurz: text(u.kurz), fakten: liste<string>(u.fakten, 5).map(text) },
    rolle: {
      kern: text(r.kern),
      aufgaben: liste<string>(r.aufgaben, 5).map(text),
      worauf_es_ankommt: liste<string>(r.worauf_es_ankommt, 3).map(text),
    },
    fit: {
      staerken: liste<{ punkt: string; beleg: string }>(f.staerken, 4),
      luecken: liste<{ punkt: string; antwort: string }>(f.luecken, 3),
    },
    pitch: text(roh.pitch),
    beispiele: liste<Vorbereitung["beispiele"][number]>(roh.beispiele, 3),
    fragen_an_dich: liste<{ frage: string; antwortskizze: string }>(roh.fragen_an_dich, 6),
    fragen_an_sie: liste<string>(roh.fragen_an_sie, 5).map(text),
    gehalt: text(roh.gehalt),
    quellen: recherche.quellen,
    erstellt: new Date().toISOString(),
  };
}

/** Lädt die Stelle, erzeugt die Vorbereitung und speichert sie. Für Route und Status-Hook. */
export async function vorbereitungFuerStelle(db: any, uuid: string, anlass = "knopf"): Promise<Vorbereitung> {
  const { data: job, error } = await db
    .from("jobs")
    .select("uuid,title,employer_name,municipal,county,country,description,application_draft")
    .eq("uuid", uuid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Stelle nicht gefunden");

  const draft = (job.application_draft ?? null) as Record<string, any> | null;
  const anschreiben = draft ? [draft.headline, ...(draft.paragraphs ?? [])].filter(Boolean).join("\n\n") : "";

  const vorbereitung = await erstelleVorbereitung({
    title: job.title ?? "",
    employer: job.employer_name ?? "",
    place: [job.municipal, job.county].filter(Boolean).join(", ") || job.country || "",
    description: job.description ?? "",
    anschreiben,
    gehalt: draft?.facts?.salary ?? "",
    kosten: { anlass, jobUuid: uuid },
  });

  const { error: writeError } = await db.from("jobs").update({ vorbereitung }).eq("uuid", uuid);
  if (writeError) throw new Error(`Vorbereitung nicht gespeichert — wurde supabase/vorbereitung.sql ausgeführt? (${writeError.message})`);
  return vorbereitung;
}
