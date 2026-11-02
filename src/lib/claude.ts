/**
 * Strukturierte Antworten von Claude über "Structured Outputs".
 *
 * Vorher sollte das Modell JSON als Freitext schreiben. Das bricht, sobald im
 * Text ein unmaskiertes Anführungszeichen steht ("Expected ',' or '}' after
 * property value …"). Ein erzwungener Tool-Aufruf scheidet aus — das aktuelle
 * Modell lehnt tool_choice "tool" ab (HTTP 400).
 *
 * Mit output_config.format = json_schema garantiert die API, dass die Antwort
 * gültiges JSON nach dem Schema ist. Kein Beta-Header nötig.
 * Doku: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */

import { bucheKosten, type KostenKontext, type Verbrauch } from "./kosten";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

function verbrauch(usage: Usage | undefined): Verbrauch {
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    suchen: usage?.server_tool_use?.web_search_requests ?? 0,
  };
}

/** Setzt additionalProperties: false auf jedes Objekt im Schema (von der API verlangt). */
function strict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    out[key] = strict(value);
  }
  if (out.type === "object" && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

export async function callClaudeJson<T>(options: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  /** Wofür der Aufruf ist — landet in der Kostentabelle (api_kosten). */
  kosten?: KostenKontext;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen.");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs);

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
        model: options.model,
        max_tokens: options.maxTokens,
        // Der Systemteil (Profil, Regeln, Beispiele) ist bei allen Aufrufen eines
        // Laufs gleich — Prompt-Caching spart dafür Kosten und Zeit.
        system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: strict(options.schema) } },
        messages: [{ role: "user", content: options.user }],
      }),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Zeitüberschreitung nach ${Math.round(options.timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Anthropic API: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
    usage?: Usage;
  };

  // Kosten buchen, bevor eine abgeschnittene Antwort zum Fehler wird —
  // bezahlt ist sie trotzdem.
  const ok = data.stop_reason !== "max_tokens" && data.stop_reason !== "refusal";
  await bucheKosten(options.model, verbrauch(data.usage), options.kosten, ok);

  if (data.stop_reason === "max_tokens") {
    throw new Error("Antwort am Token-Limit abgeschnitten.");
  }
  if (data.stop_reason === "refusal") {
    throw new Error("Modell hat die Antwort verweigert.");
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Antwort ist kein gültiges JSON (stop_reason: ${data.stop_reason ?? "?"}). Anfang: ${text.slice(0, 200)}`
    );
  }
}

export type Quelle = { title: string; url: string };

/**
 * Freitext-Recherche mit der eingebauten Websuche der Claude API
 * (Server-Tool "web_search", 10 $ pro 1.000 Suchen plus Tokens).
 * Doku: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 *
 * Getrennt von callClaudeJson, weil die Doku zur Kombination von Websuche und
 * Structured Outputs nichts sagt — so bleibt das Briefing danach garantiert
 * gültiges JSON. Lange Suchen können mit stop_reason "pause_turn" pausieren;
 * dann wird die Antwort unverändert zurückgeschickt, damit Claude weitermacht.
 */
export async function callClaudeRecherche(options: {
  model: string;
  prompt: string;
  maxSearches: number;
  maxTokens: number;
  timeoutMs: number;
  kosten?: KostenKontext;
}): Promise<{ text: string; quellen: Quelle[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen.");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs);

  type Block = {
    type: string;
    text?: string;
    citations?: Array<{ url?: string; title?: string }>;
    content?: unknown;
  };
  const messages: Array<{ role: string; content: unknown }> = [{ role: "user", content: options.prompt }];
  const bloecke: Block[] = [];
  const summe: Verbrauch = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, suchen: 0 };

  try {
    for (let runde = 0; runde < 3; runde++) {
      const res = await fetch(ANTHROPIC_URL, {
        signal: abort.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: options.maxSearches,
              user_location: { type: "approximate", city: "Hamburg", country: "DE", timezone: "Europe/Berlin" },
            },
          ],
          messages,
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Anthropic API (Websuche): HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as { content?: Block[]; stop_reason?: string; usage?: Usage };
      const v = verbrauch(data.usage);
      summe.input += v.input;
      summe.output += v.output;
      summe.cacheWrite += v.cacheWrite;
      summe.cacheRead += v.cacheRead;
      summe.suchen += v.suchen;
      const content = data.content ?? [];
      bloecke.push(...content);
      if (data.stop_reason !== "pause_turn") break;
      // Pausiert: Antwort unverändert zurückgeben, Claude setzt die Suche fort.
      messages.push({ role: "assistant", content });
    }
  } catch (error) {
    // Auch abgebrochene Recherchen kosten, was bis dahin verbraucht wurde.
    if (summe.input || summe.output) await bucheKosten(options.model, summe, options.kosten, false);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Websuche: Zeitüberschreitung nach ${Math.round(options.timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  await bucheKosten(options.model, summe, options.kosten, true);

  const text = bloecke
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

  // Quellen: zuerst die tatsächlich zitierten, sonst die Suchtreffer.
  const gesehen = new Map<string, string>();
  for (const b of bloecke) {
    for (const c of b.citations ?? []) {
      if (c.url && !gesehen.has(c.url)) gesehen.set(c.url, c.title ?? c.url);
    }
  }
  if (gesehen.size === 0) {
    for (const b of bloecke) {
      if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content as Array<{ url?: string; title?: string }>) {
        if (r.url && !gesehen.has(r.url)) gesehen.set(r.url, r.title ?? r.url);
      }
    }
  }

  return { text, quellen: Array.from(gesehen, ([url, title]) => ({ url, title })).slice(0, 6) };
}
