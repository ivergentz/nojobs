/**
 * Benachrichtigung über Telegram.
 *
 * Bewusst als Digest, nicht als Einzelnachricht pro Stelle: Bei zwei bis fünf
 * Treffern pro Woche ist eine Sammelnachricht ruhiger. Und bei null Treffern
 * wird NICHTS geschickt — eine tägliche Leermeldung trainiert einen darauf,
 * die Benachrichtigung zu ignorieren.
 */

const TELEGRAM_BASE = "https://api.telegram.org";

export type NotifyJob = {
  title: string;
  employer: string;
  place: string;
  fit: string;
  summary: string;
  /** Hinweis, falls schon eine Bewerbung bei dieser Firma läuft. */
  warnung?: string | null;
  url: string | null;
  due: string | null;
  /** Suchspur: "ki" oder "upgrade" (Career Upgrade). */
  spur?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Telegram nimmt höchstens 4.096 Zeichen pro Nachricht. Gemessen wird hier der
 * Rohtext inklusive HTML-Tags — das ist strenger als Telegram selbst zählt.
 * Passt nicht alles, werden spätere Stellen zur Kurzzeile, danach nur noch
 * gezählt („… und N weitere in der Inbox“). Normale Tage bleiben unverändert.
 */
export const TELEGRAM_LIMIT = 4096;
const BUDGET = 3800;

export function buildMessage(jobs: NotifyJob[], inboxUrl: string): string {
  // Zwei Suchspuren: KI & Automation (Hauptspur) und Career Upgrade.
  const upgrade = jobs.filter((job) => job.spur === "upgrade");
  const ki = jobs.filter((job) => job.spur !== "upgrade");
  const hot = ki.filter((job) => job.fit === "must_apply");
  const rest = ki.filter((job) => job.fit !== "must_apply");
  const upgradeHot = upgrade.filter((job) => job.fit === "must_apply");
  const upgradeRest = upgrade.filter((job) => job.fit !== "must_apply");

  const blockZeilen = (job: NotifyJob, icon: string): string[] => {
    const z: string[] = [""];
    z.push(`${icon} <b>${escapeHtml(job.title)}</b>`);
    if (job.warnung) z.push(`⚠️ ${escapeHtml(job.warnung)}`);
    z.push(`${escapeHtml(job.employer)} · ${escapeHtml(job.place)}`);
    if (job.due) z.push(`Frist: ${escapeHtml(job.due)}`);
    if (job.summary) z.push(escapeHtml(job.summary));
    if (job.url) z.push(job.url);
    return z;
  };
  const kurz = (job: NotifyJob, icon: string) =>
    `${icon} ${escapeHtml(job.title)} — ${escapeHtml(job.employer)}${job.warnung ? " ⚠️ schon beworben" : ""}`;

  const lines: string[] = [];
  let laenge = 0;
  let weggelassen = 0;
  // Platz für den Schluss („… und N weitere“ + Inbox-Link) immer freihalten.
  const reserve = inboxUrl.length + 60;
  const dazu = (neu: string[]): boolean => {
    const zusatz = neu.reduce((n, z) => n + z.length + 1, 0);
    if (laenge + zusatz + reserve > BUDGET) return false;
    lines.push(...neu);
    laenge += zusatz;
    return true;
  };
  const stelle = (job: NotifyJob, icon: string) => {
    if (!dazu(blockZeilen(job, icon)) && !dazu(["", kurz(job, icon)]) && !dazu([kurz(job, icon)])) weggelassen += 1;
  };
  const zeile = (job: NotifyJob, icon: string) => {
    if (!dazu([kurz(job, icon)])) weggelassen += 1;
  };

  const anzahlBewerben = hot.length + upgradeHot.length;
  dazu([
    anzahlBewerben === 1
      ? "<b>Eine neue Stelle zum Bewerben</b>"
      : `<b>${anzahlBewerben} neue Stellen zum Bewerben</b>`,
  ]);

  for (const job of hot) stelle(job, "🔥");

  if (rest.length > 0) {
    dazu(["", `Dazu ${rest.length} zum Anschauen:`]);
    for (const job of rest.slice(0, 8)) zeile(job, "👍");
  }

  if (upgrade.length > 0) {
    dazu(["", "<b>⬆️ Career Upgrade</b>"]);
    for (const job of upgradeHot) stelle(job, "🔥");
    if (upgradeRest.length > 0) {
      if (upgradeHot.length > 0) dazu([""]);
      for (const job of upgradeRest.slice(0, 5)) zeile(job, "👍");
    }
  }

  if (weggelassen > 0) {
    lines.push("");
    lines.push(`… und ${weggelassen} weitere in der Inbox`);
  }
  lines.push("");
  lines.push(inboxUrl);

  return lines.join("\n");
}

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlt.");
  }

  const res = await fetch(`${TELEGRAM_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Telegram: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
}

/**
 * Hilfsfunktion für die Einrichtung: liest die Chat-ID aus den letzten
 * Nachrichten an den Bot. Erspart das Herumsuchen in der Telegram-API.
 */
export async function findChatId(): Promise<Array<{ id: number; name: string }>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN fehlt.");

  const res = await fetch(`${TELEGRAM_BASE}/bot${token}/getUpdates`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Telegram: HTTP ${res.status}`);

  const body = (await res.json()) as {
    result?: Array<{ message?: { chat?: { id?: number; first_name?: string; title?: string } } }>;
  };

  const seen = new Map<number, string>();
  for (const update of body.result ?? []) {
    const chat = update.message?.chat;
    if (chat?.id) seen.set(chat.id, chat.title ?? chat.first_name ?? "");
  }

  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}
