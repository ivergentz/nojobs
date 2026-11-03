/**
 * Phase 3 · Telegram pro Person (weitere Profile).
 *
 * Verbinden ohne Webhook und ohne Einrichtung in Telegram:
 *   1. „Mit Telegram verbinden“ erzeugt einen kurzen Code (15 Minuten gültig) und den Link
 *      https://t.me/<bot>?start=<code>.
 *   2. Die Person tippt in Telegram auf „Start“ — Telegram schickt „/start <code>“ an den Bot.
 *   3. Die Seite fragt nach (getUpdates), findet den Code, speichert die Chat-ID.
 * Gespeichert in profiles.einstellungen (telegram, telegram_code) — keine neue Tabelle.
 *
 * Dein eigenes Telegram (TELEGRAM_CHAT_ID) bleibt unverändert und wird hier nie benutzt.
 */

import { randomBytes } from "node:crypto";
import { buildMessage, type NotifyJob } from "./notify";
import { AKTIVE_QUELLEN } from "./quellen";
import { BEWORBEN_STATUS, findeFruehere, WARN_TAGE } from "./firma";
import { lesen } from "./lesen";
import { schreibeFelder } from "./schreiben";

const BASE = "https://api.telegram.org";
export const CODE_MINUTEN = 15;

export type TelegramVerbindung = { chat_id: number; name: string; verbunden_at: string };
export type TelegramCode = { code: string; exp: number };

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN fehlt.");
  return t;
}

let botNameCache: string | null = null;
export async function botName(): Promise<string> {
  if (botNameCache) return botNameCache;
  const res = await fetch(`${BASE}/bot${token()}/getMe`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { username?: string } };
  if (!body.result?.username) throw new Error("Telegram: Bot-Name nicht lesbar.");
  botNameCache = body.result.username;
  return botNameCache;
}

/** Kurzer, gut tippbarer Code (Telegram erlaubt A–Z, a–z, 0–9, _ und -). */
export function neuerCode(): TelegramCode {
  return { code: randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 12), exp: Date.now() + CODE_MINUTEN * 60_000 };
}

export function codeGueltig(code: unknown): code is TelegramCode {
  const c = code as TelegramCode | null;
  return Boolean(c && typeof c.code === "string" && c.code.length >= 8 && typeof c.exp === "number" && c.exp > Date.now());
}

export function verbindungAus(einstellungen: Record<string, unknown>): TelegramVerbindung | null {
  const t = einstellungen.telegram as TelegramVerbindung | null | undefined;
  return t && typeof t.chat_id === "number" ? t : null;
}

/** Sucht in den letzten Nachrichten an den Bot nach „/start <code>“. */
export async function findeStart(code: string): Promise<{ chat_id: number; name: string } | null> {
  // offset=-100: die letzten 100 Nachrichten; ältere vergisst Telegram dabei — für den Bot unkritisch.
  const res = await fetch(`${BASE}/bot${token()}/getUpdates?offset=-100&allowed_updates=${encodeURIComponent('["message"]')}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    result?: Array<{ message?: { text?: string; chat?: { id?: number; type?: string; first_name?: string; last_name?: string; username?: string } } }>;
  };
  for (const u of [...(body.result ?? [])].reverse()) {
    const m = u.message;
    if (!m?.chat?.id || m.chat.type !== "private") continue;
    if ((m.text ?? "").trim() === `/start ${code}`) {
      const name = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ") || (m.chat.username ? `@${m.chat.username}` : "Telegram");
      return { chat_id: m.chat.id, name };
    }
  }
  return null;
}

export async function sendeAn(chatId: number, text: string): Promise<void> {
  const res = await fetch(`${BASE}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Telegram: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
}

type Db = Parameters<typeof lesen>[0];

/**
 * Morgennachricht für ein weiteres Profil — gleiche Regel wie bei dir: nur wenn mindestens
 * eine neue Stelle auf „Bewerben“ steht. Danach werden die gemeldeten Stellen für dieses
 * Profil als benachrichtigt markiert (in matches, nie in deinen Daten).
 */
export async function morgennachrichtFuer(
  db: Db,
  profil: { slug: string; name: string },
  chatId: number,
  inboxUrl: string
): Promise<{ gesendet: boolean; stellen: number; bewerben: number }> {
  const { data, error } = await lesen(db, profil.slug)
    .select("uuid,title,employer_name,municipal,county,country,eval_fit,eval_summary,application_url,application_due")
    .eq("status", "ACTIVE")
    .in("source", AKTIVE_QUELLEN)
    .in("eval_fit", ["must_apply", "worth_reading"])
    .eq("app_status", "neu")
    .is("notified_at", null)
    .order("eval_fit", { ascending: true })
    .limit(30);
  if (error) throw new Error(`Stellen lesen (${profil.name}): ${error.message}`);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const bewerben = rows.filter((r) => r.eval_fit === "must_apply").length;
  if (bewerben === 0) return { gesendet: false, stellen: rows.length, bewerben };

  const { data: bewerbungen } = await lesen(db, profil.slug)
    .select("uuid,employer_name,title,app_status,app_status_at")
    .in("app_status", BEWORBEN_STATUS)
    .gte("app_status_at", new Date(Date.now() - WARN_TAGE * 864e5).toISOString())
    .limit(300);

  const jobs: NotifyJob[] = rows.map((row) => {
    const frueher = findeFruehere(
      { uuid: row.uuid as string, employer: (row.employer_name as string) ?? null, title: (row.title as string) ?? null },
      (bewerbungen ?? []) as any
    );
    return {
      title: (row.title as string) ?? "Ohne Titel",
      employer: (row.employer_name as string) ?? "—",
      place: [row.municipal, row.county].filter(Boolean).join(", ") || ((row.country as string) ?? "—"),
      fit: (row.eval_fit as string) ?? "worth_reading",
      summary: (row.eval_summary as string) ?? "",
      url: (row.application_url as string) ?? null,
      due: (row.application_due as string) ?? null,
      warnung: frueher.length ? (frueher.some((f) => f.gleicheStelle) ? "Auf diese Stelle schon beworben" : `Schon beworben bei ${row.employer_name}`) : null,
      spur: null,
    };
  });

  await sendeAn(chatId, buildMessage(jobs, inboxUrl));
  const jetzt = new Date().toISOString();
  for (const row of rows) await schreibeFelder(db, profil.slug, row.uuid as string, { notified_at: jetzt });
  return { gesendet: true, stellen: rows.length, bewerben };
}
