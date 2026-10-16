/**
 * Schreibt den Lebenslauf aus src/i18n/cv.js nach public/cv.json.
 *
 * Läuft vor jedem Build (siehe "build" in package.json). Damit ist
 * https://ivergentz.de/cv.json immer auf dem Stand der Website, und die
 * Career Inbox erzeugt Bewerbungsunterlagen aus genau diesen Daten.
 * Eine einzige Quelle: Lebenslauf nur noch in src/i18n/cv.js pflegen.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'i18n', 'cv.js'), 'utf8');

// cv.js ist ein ES-Modul ohne Imports. Das "export" entfernen und den
// Inhalt in einer leeren Sandbox auswerten.
const code = source.replace(/export\s+const\s+cvContent\s*=/, 'cvContent =');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`var cvContent;\n${code}`, sandbox);

const cv = sandbox.cvContent;
if (!cv || !cv.de || !cv.en || !Array.isArray(cv.de.experience)) {
  throw new Error('export-cv: cvContent in src/i18n/cv.js nicht gefunden oder unvollständig.');
}

const out = { _meta: { quelle: 'ivergentz.de', erzeugt: new Date().toISOString() }, ...JSON.parse(JSON.stringify(cv)) };
fs.writeFileSync(path.join(root, 'public', 'cv.json'), JSON.stringify(out, null, 2));
console.log('export-cv: public/cv.json geschrieben');
