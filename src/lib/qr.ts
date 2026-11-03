import qrcode from "./vendor/qrcode-generator.js";

/** QR-Code als SVG (schwarz auf weiß, mit Ruhezone) — zum Abscannen mit der Handykamera. */
export function qrSvg(text: string, groesse = 200): string {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const rand = 4;
  const gesamt = n + rand * 2;
  let pfad = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) pfad += `M${c + rand} ${r + rand}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gesamt} ${gesamt}" width="${groesse}" height="${groesse}" shape-rendering="crispEdges" role="img" aria-label="QR-Code zum Telegram-Bot"><rect width="100%" height="100%" fill="#fff"/><path d="${pfad}" fill="#000"/></svg>`;
}
