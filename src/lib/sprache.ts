/**
 * Grobe Spracherkennung für Stellenanzeigen: Englisch oder Deutsch?
 * Zählt häufige Funktionswörter — reicht, um die Voreinstellung der Unterlagen-Sprache zu wählen.
 * Im Zweifel Deutsch.
 */
const EN = new Set("the and of to with for you your our we are will is in on as an be this that or have experience team skills role about who what".split(" "));
const DE = new Set("und der die das mit für sie ihr ihre wir sind ist in auf als ein eine einer zu von bei unsere unser du dein deine wird werden oder erfahrung".split(" "));

export function erkenneSprache(...texte: Array<string | null | undefined>): "de" | "en" {
  const woerter = texte
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .split(/[^a-zäöüß]+/)
    .filter(Boolean)
    .slice(0, 1500);
  let en = 0;
  let de = 0;
  for (const w of woerter) {
    if (EN.has(w)) en += 1;
    if (DE.has(w)) de += 1;
  }
  // „in“ zählt für beide — erst ab deutlichem Vorsprung und genug Text Englisch wählen
  return en >= 8 && en > de * 1.5 ? "en" : "de";
}
