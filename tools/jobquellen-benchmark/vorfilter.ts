import type { BenchJob, BenchProfil, Relevanz } from "./typen";
import { normTitel, stadt } from "./duplikate";

/**
 * Kostenloser, regelbasierter Vorfilter — ohne KI. Im Zweifel „unklar“, nie vorschnell „unpassend“.
 *
 *   unpassend  Titel enthält einen harten Ausschluss (Praktikum, Werkstudent … — dieselbe Liste wie
 *              der produktive Import) · Ort eindeutig im Ausland · Titel hat mit keinem Suchbegriff
 *              ein Wort gemeinsam · Nogo Zeitarbeit und Arbeitgeber ist erkennbar ein Personaldienstleister
 *   relevant   alle Wörter eines Suchbegriffs stehen im Titel UND der Ort passt (Stadt genannt,
 *              remote, oder BA hat bereits nach Umkreis gesucht)
 *   unklar     alles dazwischen (z. B. nur ein Teil des Begriffs im Titel, Ort nicht prüfbar)
 *
 * Grenze: Der Umkreis ist ohne Geokodierung nicht prüfbar. Nur die BA sucht selbst im Umkreis;
 * bei Google/Adzuna zählt ein Nachbarort deshalb als „Ort nicht prüfbar“ → unklar.
 */

// Gleiche Liste wie TITEL_AUSSCHLUSS in src/lib/normalize-de.ts (dort nicht exportiert; hier gespiegelt).
export const TITEL_AUSSCHLUSS = [
  "praktikum", "praktikant", "werkstudent", "trainee", "ausbildung",
  "azubi", "duales studium", "bachelorand", "masterand", "aushilfe",
  "minijob", "abschlussarbeit",
];

const AUSLAND = /\b(österreich|austria|schweiz|switzerland|suisse|niederlande|netherlands|polen|poland|frankreich|france|spanien|spain|united kingdom|london|usa|united states|wien|zürich|zurich|amsterdam)\b/i;
const PERSONALDIENSTLEISTER = /\b(zeitarbeit|personaldienst|personalservice|personal ?leasing|arbeitnehmerüberlassung|randstad|adecco|manpower|hays|persona service|dis ag|orizon|tempton|jobactive|piening|amadeus fire|gi group|start people|timepartner)\b/i;
const FUELL = new Set(["und", "oder", "der", "die", "das", "für", "fur", "im", "in", "mit", "von", "zur", "zum", "m", "w", "d"]);

const woerter = (s: string) => normTitel(s).split(" ").filter((w) => w.length > 1 && !FUELL.has(w));

export type OrtBefund = "passt" | "remote" | "ausland" | "nicht-pruefbar";

export function ortBefund(job: BenchJob, profil: BenchProfil): OrtBefund {
  const ort = (job.location ?? "").trim();
  if (job.remote === true || /\b(remote|homeoffice|home office|bundesweit)\b/i.test(ort)) return "remote";
  if (ort && AUSLAND.test(ort) && !/deutschland|germany/i.test(ort)) return "ausland";
  // Die BA hat im Umkreis gesucht (bzw. für dich: produktiver Ortsfilter angewendet) — gilt als passend.
  if (job.source === "ba") return "passt";
  const ziel = stadt(profil.ort ?? "");
  if (ziel && stadt(ort).includes(ziel)) return "passt";
  return "nicht-pruefbar";
}

export function bewerte(job: BenchJob, profil: BenchProfil): Relevanz {
  const titel = normTitel(job.title);
  if (TITEL_AUSSCHLUSS.some((a) => titel.includes(a))) return "unpassend";
  const ort = ortBefund(job, profil);
  if (ort === "ausland") return "unpassend";
  if (profil.nogos.includes("zeitarbeit") && PERSONALDIENSTLEISTER.test(job.company ?? "")) return "unpassend";

  const titelWoerter = new Set(woerter(job.title));
  // Wortanfang genügt („erzieher“ trifft „erzieherin“, „produktmanager“ trifft „produktmanagerin“)
  // … und Wortteile ab 4 Buchstaben („koch“ trifft „jungkoch“, „kita“ trifft „kitaleitung“)
  const trifft = (w: string) => [...titelWoerter].some((t) => t.startsWith(w) || w.startsWith(t) || (w.length >= 4 && t.includes(w)));
  const begriffe = profil.suchbegriffe.map(woerter).filter((b) => b.length > 0);
  const voll = begriffe.some((b) => b.every(trifft));
  const teil = begriffe.some((b) => b.some((w) => w.length >= 3 && trifft(w)));

  if (!voll && !teil) return "unpassend";
  if (profil.arbeitsort.length === 1 && profil.arbeitsort[0] === "remote" && ort !== "remote") return "unklar";
  if (voll && (ort === "passt" || ort === "remote")) return "relevant";
  return "unklar";
}
