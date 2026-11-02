import { inflateRawSync } from "node:zlib";

/**
 * Schritt 2.4 · Text aus einer Word-Datei (.docx) holen — ohne zusätzliche Bibliothek.
 *
 * Eine .docx ist ein ZIP-Archiv; der Fließtext steht in word/document.xml.
 * Wir lesen das Inhaltsverzeichnis des Archivs, entpacken genau diese Datei und
 * machen aus den Absätzen (<w:p>) Zeilen. Tabellenzellen werden mit " | " getrennt.
 */
export function docxText(datei: Buffer): string {
  const eintrag = zipEintrag(datei, "word/document.xml");
  if (!eintrag) throw new Error("Keine gültige Word-Datei (word/document.xml fehlt).");
  const xml = eintrag.toString("utf8");
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    // Tabellen: Zellen einer Zeile mit " | " verbinden, Zeilenende = neue Zeile
    .replace(/<\/w:p>\s*<\/w:tc>/g, "</w:tc>")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/ \| \n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function zipEintrag(zip: Buffer, name: string): Buffer | null {
  // Ende des zentralen Verzeichnisses suchen (Signatur 0x06054b50), von hinten
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const anzahl = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < anzahl; n++) {
    if (zip.readUInt32LE(pos) !== 0x02014b50) return null;
    const methode = zip.readUInt16LE(pos + 10);
    const komprimiert = zip.readUInt32LE(pos + 20);
    const nameLaenge = zip.readUInt16LE(pos + 28);
    const extraLaenge = zip.readUInt16LE(pos + 30);
    const kommentarLaenge = zip.readUInt16LE(pos + 32);
    const lokal = zip.readUInt32LE(pos + 42);
    const eintragName = zip.toString("utf8", pos + 46, pos + 46 + nameLaenge);
    if (eintragName === name) {
      const lokalName = zip.readUInt16LE(lokal + 26);
      const lokalExtra = zip.readUInt16LE(lokal + 28);
      const start = lokal + 30 + lokalName + lokalExtra;
      const daten = zip.subarray(start, start + komprimiert);
      if (methode === 0) return Buffer.from(daten);
      if (methode === 8) return inflateRawSync(daten);
      throw new Error(`Komprimierung ${methode} wird nicht unterstützt.`);
    }
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return null;
}
