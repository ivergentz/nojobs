/**
 * Stelle hinzufügen: eine Anzeige aus einem Link (oder eingefügtem Text) einlesen.
 *
 * Reihenfolge — immer der günstigste Weg zuerst:
 *   1. Bewerbersystem am Link erkannt (Ashby, Greenhouse, Lever, Personio, SmartRecruiters, Recruitee)
 *      → offizielle Schnittstelle, vollständige Anzeige, ohne KI.
 *   2. Seite abrufen: eingebettete Stellendaten (JSON-LD „JobPosting“, wie für Google Jobs) → ohne KI.
 *   3. Sichtbarer Seitentext oder eingefügter Text → Claude Haiku zieht Titel, Firma, Ort heraus (~0,1 ¢).
 *   4. Nichts Brauchbares → Bitte, den Anzeigentext einzufügen.
 *
 * Sicherheit: Es werden nur öffentliche http(s)-Adressen abgerufen (keine internen Netze, Ports 80/443),
 * jede Weiterleitung wird erneut geprüft, Zeit- und Größenlimit.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { fetchFirmenJobs, type Ats, type AtsJob, type Firma } from "./sources/ats";
import { clean, htmlToText, toIso } from "./sources/text";
import { callClaudeJson } from "./claude";

export type Eingelesen = {
  title: string;
  company: string;
  location: string;
  description: string;
  published: string | null;
  url: string | null;
  remote: boolean | null;
  weg: "ats" | "jsonld" | "text" | "eingefuegt";
};

export class BrauchtText extends Error {}

const MAX_BYTES = 2_000_000;
const MIN_TEXT = 400;

/* ------------------------------------------------------------- Adresse */

export function bereinigeUrl(roh: string): string | null {
  let u: URL;
  try {
    u = new URL(roh.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|trk|ref$|refid|src$|source$|mc_|lipi|trackingId)/i.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}

function privat(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privat(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** Nur öffentliche Ziele: http(s), Port 80/443, kein localhost, keine privaten oder internen IPs. */
export async function pruefeZiel(url: string, aufloesen: (host: string) => Promise<string[]> = standardAufloesen): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Nur http- und https-Links.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Dieser Link verwendet einen ungewöhnlichen Port.");
  if (u.username || u.password) throw new Error("Links mit Zugangsdaten werden nicht abgerufen.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIP(host)) throw new Error("Dieser Link zeigt nicht auf eine öffentliche Seite.");
  const ips = isIP(host) ? [host] : await aufloesen(host);
  if (!ips.length || ips.some(privat)) throw new Error("Dieser Link zeigt nicht auf eine öffentliche Seite.");
}

async function standardAufloesen(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error("Die Adresse ist nicht erreichbar.");
  }
}

/** Seite holen: Weiterleitungen selbst folgen (jede neu geprüft), Größe und Zeit begrenzt. */
export async function holeSeite(url: string, aufloesen?: (host: string) => Promise<string[]>): Promise<{ html: string; url: string }> {
  let ziel = url;
  for (let i = 0; i < 4; i++) {
    await pruefeZiel(ziel, aufloesen);
    const res = await fetch(ziel, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; nojobs/1.0; Stellenanzeige einlesen)", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      ziel = new URL(res.headers.get("location") as string, ziel).toString();
      continue;
    }
    if (!res.ok) throw new BrauchtText(`Die Seite antwortet mit HTTP ${res.status}.`);
    const art = res.headers.get("content-type") ?? "";
    if (art && !/html|xml|text/i.test(art)) throw new BrauchtText("Der Link führt nicht auf eine Webseite.");
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), url: ziel };
    const teile: Uint8Array[] = [];
    let groesse = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      groesse += value.byteLength;
      if (groesse > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      teile.push(value);
    }
    return { html: Buffer.concat(teile).toString("utf8"), url: ziel };
  }
  throw new BrauchtText("Zu viele Weiterleitungen.");
}

/* ------------------------------------------------------ Bewerbersysteme */

export type AtsTreffer = { firma: Firma; id: string };

/** Erkennt die Bewerbersysteme, die nojobs schon für die Karriereseiten-Quelle anbindet. */
export function erkenneAts(url: string): AtsTreffer | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const teile = u.pathname.split("/").filter(Boolean);
  const firma = (ats: Ats, slug: string, extra: Partial<Firma> = {}): Firma => ({ name: slug, ats, slug, ...extra }) as Firma;
  if (host === "jobs.ashbyhq.com" && teile.length >= 2) return { firma: firma("ashby", teile[0]), id: teile[1] };
  const gh = host.match(/^(?:boards|job-boards)(\.eu)?\.greenhouse\.io$/);
  if (gh && teile.length >= 3 && teile[1] === "jobs") return { firma: firma("greenhouse", teile[0], gh[1] ? { region: "eu" } : {}), id: teile[2] };
  const lv = host.match(/^jobs(\.eu)?\.lever\.co$/);
  if (lv && teile.length >= 2) return { firma: firma("lever", teile[0], lv[1] ? { region: "eu" } : {}), id: teile[1] };
  const pe = host.match(/^([a-z0-9-]+)\.(jobs\.personio\.(?:de|com))$/);
  if (pe && teile[0] === "job" && teile[1]) return { firma: firma("personio", pe[1], { domain: pe[2] }), id: teile[1] };
  if (host === "jobs.smartrecruiters.com" && teile.length >= 2) return { firma: firma("smartrecruiters", teile[0]), id: teile[1].split("-")[0] };
  const rc = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
  if (rc && teile[0] === "o" && teile[1]) return { firma: firma("recruitee", rc[1]), id: teile[1] };
  return null;
}

export function passtZurId(job: AtsJob, id: string): boolean {
  const i = id.toLowerCase();
  return job.id.toLowerCase() === i || (job.url ?? "").toLowerCase().includes(i);
}

async function ausAts(t: AtsTreffer): Promise<Eingelesen | null> {
  const jobs = await fetchFirmenJobs(t.firma, (id) => id.toLowerCase().startsWith(t.id.toLowerCase()));
  const job = jobs.find((j) => passtZurId(j, t.id));
  if (!job || !job.description || job.description.length < 100) return null;
  return { title: job.title, company: "", location: job.location, description: job.description, published: job.published, url: job.url, remote: job.remote, weg: "ats" };
}

/* ------------------------------------------------------------- JSON-LD */

export function ausJsonLd(html: string): Omit<Eingelesen, "url" | "weg"> | null {
  const bloecke = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const kandidaten: any[] = [];
  const sammle = (x: any) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(sammle);
    kandidaten.push(x);
    if (x["@graph"]) sammle(x["@graph"]);
  };
  for (const b of bloecke) {
    try {
      sammle(JSON.parse(b.trim()));
    } catch {
      /* kaputtes JSON-LD ignorieren */
    }
  }
  const p = kandidaten.find((k) => [k["@type"]].flat().some((t) => String(t).toLowerCase() === "jobposting"));
  if (!p) return null;
  const orte = [p.jobLocation].flat().filter(Boolean).map((l: any) => clean(l?.address?.addressLocality) ?? clean(l?.address?.addressRegion) ?? clean(l?.name)).filter(Boolean);
  const beschreibung = htmlToText(typeof p.description === "string" ? p.description : "");
  if (!clean(p.title) || beschreibung.length < 100) return null;
  return {
    title: clean(p.title) as string,
    company: clean(p.hiringOrganization?.name) ?? (typeof p.hiringOrganization === "string" ? p.hiringOrganization : ""),
    location: [...new Set(orte)].join(", "),
    description: beschreibung,
    published: toIso(p.datePosted),
    remote: String(p.jobLocationType ?? "").toUpperCase() === "TELECOMMUTE" ? true : null,
  };
}

export function seitenText(html: string): string {
  const ohne = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return htmlToText(ohne).slice(0, 20_000);
}

export function seitenTitel(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return clean(htmlToText(og ?? t ?? "")) ?? "";
}

/** „Technical Product Lead (f/m/d) @ adjoe“ · „… bei ERGO“ · „… at Acme“ → Firma */
export function firmaAusTitel(titel: string): string {
  const m = titel.match(/\s(?:@|bei|at)\s+([^|–—-]+?)\s*(?:[|–—-].*)?$/i);
  return m ? m[1].trim() : "";
}

/* ---------------------------------------------------------------- KI */

const SCHEMA = {
  type: "object",
  properties: {
    ist_stellenanzeige: { type: "boolean" },
    titel: { type: "string" },
    firma: { type: "string" },
    ort: { type: "string" },
    remote: { type: "boolean" },
    beschreibung: { type: "string", description: "Aufgaben, Anforderungen, Angebot — wörtlich bzw. sinngemäß vollständig, ohne Navigation und Cookie-Texte" },
  },
  required: ["ist_stellenanzeige", "titel", "firma", "ort", "beschreibung"],
};

async function ausText(text: string, kontext: { profil: string; hinweisTitel?: string }): Promise<Omit<Eingelesen, "url" | "weg" | "published">> {
  const r = await callClaudeJson<{ ist_stellenanzeige: boolean; titel: string; firma: string; ort: string; remote?: boolean; beschreibung: string }>({
    model: "claude-haiku-4-5-20251001",
    system:
      "Du liest den Text einer Webseite oder eingefügten Text und ziehst daraus genau eine Stellenanzeige heraus. Erfinde nichts. Fehlt eine Angabe, gib einen leeren String zurück. Ist der Text keine Stellenanzeige, setze ist_stellenanzeige auf false.",
    user: `${kontext.hinweisTitel ? `Seitentitel: ${kontext.hinweisTitel}\n\n` : ""}Text:\n${text.slice(0, 16_000)}`,
    schema: SCHEMA,
    maxTokens: 3000,
    timeoutMs: 45_000,
    kosten: { zweck: "einlesen", anlass: "stelle-hinzufuegen", profil: kontext.profil },
  });
  if (!r.ist_stellenanzeige || !r.titel.trim() || r.beschreibung.trim().length < 150) throw new BrauchtText("Darin war keine vollständige Stellenanzeige zu finden.");
  return { title: r.titel.trim(), company: r.firma.trim(), location: r.ort.trim(), description: r.beschreibung.trim(), remote: r.remote === true ? true : null };
}

/* ------------------------------------------------------------- Ablauf */

export async function liesStelle(
  eingabe: { url?: string | null; text?: string | null },
  kontext: { profil: string },
  hilfen: { aufloesen?: (host: string) => Promise<string[]> } = {}
): Promise<Eingelesen> {
  const url = eingabe.url ? bereinigeUrl(eingabe.url) : null;
  if (eingabe.url && !url) throw new Error("Das sieht nicht wie ein gültiger Link aus.");
  const text = (eingabe.text ?? "").trim();

  // Eingefügter Text hat Vorrang — die Person hat ihn bewusst eingefügt.
  if (text.length >= 200) {
    const r = await ausText(text, kontext);
    return { ...r, published: null, url, weg: "eingefuegt" };
  }
  if (!url) throw new BrauchtText("Bitte einen Link oder den Text der Anzeige einfügen.");
  if (/(^|\.)linkedin\.com$/i.test(new URL(url).hostname)) {
    throw new BrauchtText("LinkedIn-Anzeigen lassen sich nicht abrufen. Nimm den Link „Auf Unternehmenswebsite bewerben“ oder füge den Anzeigentext ein.");
  }

  const ats = erkenneAts(url);
  if (ats) {
    try {
      const r = await ausAts(ats);
      if (r) {
        // Die Schnittstellen nennen die Firma nicht — aus dem Seitentitel („… @ adjoe“), sonst aus der Kennung.
        let firma = "";
        try {
          firma = firmaAusTitel(seitenTitel((await holeSeite(url, hilfen.aufloesen)).html));
        } catch {
          /* Titel ist nur nett zu haben */
        }
        return { ...r, company: firma || ats.firma.slug.replace(/[-_]+/g, " ").replace(/^\p{L}/u, (c) => c.toUpperCase()), url: r.url ?? url };
      }
    } catch {
      /* Schnittstelle nicht erreichbar → normale Seite versuchen */
    }
  }

  const seite = await holeSeite(url, hilfen.aufloesen);
  const ld = ausJsonLd(seite.html);
  if (ld) return { ...ld, url, weg: "jsonld" };
  const sichtbar = seitenText(seite.html);
  if (sichtbar.length < MIN_TEXT) throw new BrauchtText("Die Seite lädt ihren Inhalt erst im Browser. Bitte den Anzeigentext einfügen.");
  const r = await ausText(sichtbar, { ...kontext, hinweisTitel: seitenTitel(seite.html) });
  return { ...r, published: null, url, weg: "text" };
}

/** Stabile ID: gleicher Link → gleiche Stelle. Ohne Link: aus Titel + Firma. */
export function manuellUuid(e: Pick<Eingelesen, "url" | "title" | "company">): string {
  const basis = e.url ? e.url.toLowerCase() : `${e.company}|${e.title}`.toLowerCase();
  return `manuell-${createHash("sha1").update(basis).digest("hex").slice(0, 16)}`;
}
