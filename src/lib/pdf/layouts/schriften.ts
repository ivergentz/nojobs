import { Font } from "@react-pdf/renderer";

/**
 * Schriften der Layouts (alle SIL Open Font License, Quelle: Fontsource), als TTF mit
 * Latin + Latin Extended — Umlaute, ß, Ł, č, „“ und € sind enthalten.
 * `basis` ist ein Ordner (Vorschau, Tests) oder eine URL (Produktion).
 */
let registriert: string | null = null;

export function registriereSchriften(basis: string) {
  if (registriert === basis) return;
  registriert = basis;
  const f = (name: string) => `${basis.replace(/\/$/, "")}/${name}.ttf`;
  Font.register({
    family: "NjSans",
    fonts: [
      { src: f("inter-400-normal"), fontWeight: 400 },
      { src: f("inter-500-normal"), fontWeight: 500 },
      { src: f("inter-600-normal"), fontWeight: 600 },
      { src: f("inter-700-normal"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NjSerif",
    fonts: [
      { src: f("sourceserif-400-normal"), fontWeight: 400 },
      { src: f("sourceserif-400-italic"), fontWeight: 400, fontStyle: "italic" },
      { src: f("sourceserif-600-normal"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "NjText",
    fonts: [
      { src: f("newsreader-400-normal"), fontWeight: 400 },
      { src: f("newsreader-400-italic"), fontWeight: 400, fontStyle: "italic" },
      { src: f("newsreader-500-normal"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "NjDisplay",
    fonts: [
      { src: f("oswald-500-normal"), fontWeight: 500 },
      { src: f("oswald-600-normal"), fontWeight: 600 },
      { src: f("oswald-700-normal"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NjRund",
    fonts: [
      { src: f("nunito-400-normal"), fontWeight: 400 },
      { src: f("nunito-400-italic"), fontWeight: 400, fontStyle: "italic" },
      { src: f("nunito-600-normal"), fontWeight: 600 },
      { src: f("nunito-700-normal"), fontWeight: 700 },
    ],
  });
  // Deutsche Komposita nicht automatisch trennen.
  Font.registerHyphenationCallback((wort) => [wort]);
}
