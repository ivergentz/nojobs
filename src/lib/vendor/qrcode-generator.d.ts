// Typen (Auszug) für die mitgelieferte Datei qrcode-generator.js
type QR = {
  addData(data: string, mode?: "Byte" | "Numeric" | "Alphanumeric"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
};
declare function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QR;
export default qrcode;
