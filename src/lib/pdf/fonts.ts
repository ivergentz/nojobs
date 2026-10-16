import { Font } from "@react-pdf/renderer";
import { CV_BASE } from "../cv-source";

/**
 * Die Schriften der Website, direkt von ivergentz.de geladen:
 * Oswald (Display), Bodoni Moda (kursive Akzente), Newsreader (Text),
 * IBM Plex Sans (Labels), Plex Mono (Daten).
 */

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;

  const font = (file: string) => `${CV_BASE}/fonts/${file}.ttf`;

  Font.register({
    family: "Oswald",
    fonts: [
      { src: font("oswald-500"), fontWeight: 500 },
      { src: font("oswald-600"), fontWeight: 600 },
      { src: font("oswald-700"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Bodoni",
    fonts: [{ src: font("bodoni-400") }, { src: font("bodoni-400-italic"), fontStyle: "italic" }],
  });
  Font.register({
    family: "Newsreader",
    fonts: [
      { src: font("newsreader-400") },
      { src: font("newsreader-400-italic"), fontStyle: "italic" },
      { src: font("newsreader-500"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "Plex",
    fonts: [
      { src: font("plex-sans-400") },
      { src: font("plex-sans-500"), fontWeight: 500 },
      { src: font("plex-sans-600"), fontWeight: 600 },
    ],
  });
  Font.register({ family: "PlexMono", src: font("plex-mono-400") });

  // Deutsche Komposita nicht automatisch trennen.
  Font.registerHyphenationCallback((word) => [word]);
}

export const COLORS = {
  ink: "#111111",
  soft: "#3B3B3B",
  mute: "#66665F",
  accent: "#C8102E",
  line: "#DADAD6",
};

export const portraitUrl = () => `${CV_BASE}/images/portrait-cv.jpg`;
