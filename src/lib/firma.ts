/**
 * Firmennamen vergleichbar machen — dieselbe Firma taucht in verschiedenen
 * Quellen unterschiedlich auf: "OTTO GmbH & Co KG", "Otto Group", "otto".
 */

const RECHTSFORMEN = /\b(gmbh|mbh|ag|se|kg|kgaa|co|ug|ohg|gbr|e\.?\s?v|inc|ltd|llc|bv|nv|sa|holding|group|gruppe|deutschland|germany)\b/g;

export function firmaKern(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[.,()/'"]/g, " ")
    .replace(RECHTSFORMEN, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Gleiche Firma? Exakt gleicher Kern, oder einer enthält den anderen (ab 4 Zeichen). */
export function gleicheFirma(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = firmaKern(a);
  const y = firmaKern(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [kurz, lang] = x.length <= y.length ? [x, y] : [y, x];
  return kurz.length >= 4 && (lang === kurz || lang.startsWith(`${kurz} `) || lang.includes(` ${kurz} `) || lang.endsWith(` ${kurz}`));
}

const titelKern = (t: string | null | undefined) =>
  (t ?? "")
    .toLowerCase()
    .replace(/\((?:[mwdfx]\s*\/\s*){1,3}[mwdfx]\)|\(all genders?\)/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();

export function gleicherTitel(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = titelKern(a);
  return Boolean(x) && x === titelKern(b);
}

export type FruehereBewerbung = {
  uuid: string;
  title: string;
  employer: string;
  status: string;
  datum: string | null;
  gleicheStelle: boolean;
};

/** Status, die als "bereits beworben" zählen. */
export const BEWORBEN_STATUS = ["beworben", "interview", "absage"];

/** Zeitraum, in dem eine frühere Bewerbung als Warnung zählt. */
export const WARN_TAGE = 60;

export function findeFruehere(
  job: { uuid: string; employer: string | null; title: string | null },
  bewerbungen: Array<{ uuid: string; employer_name: string | null; title: string | null; app_status: string; app_status_at: string | null }>
): FruehereBewerbung[] {
  const grenze = Date.now() - WARN_TAGE * 864e5;
  return bewerbungen
    .filter((b) => b.uuid !== job.uuid)
    .filter((b) => BEWORBEN_STATUS.includes(b.app_status))
    .filter((b) => !b.app_status_at || new Date(b.app_status_at).getTime() >= grenze)
    .filter((b) => gleicheFirma(b.employer_name, job.employer))
    .map((b) => ({
      uuid: b.uuid,
      title: b.title ?? "",
      employer: b.employer_name ?? "",
      status: b.app_status,
      datum: b.app_status_at,
      gleicheStelle: gleicherTitel(b.title, job.title),
    }));
}
