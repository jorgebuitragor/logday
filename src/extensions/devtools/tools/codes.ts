// Códigos QR y de barras (specs/devtools D15, D16). Se generan como SVG
// propio a partir de la matriz (QR) o de las barras (JsBarcode solo
// codifica): sin DOM, así que se prueba en vitest, y el SVG es el mismo
// para la vista previa, para copiarlo y para el PNG.
import qrcode from 'qrcode-generator';
import barcodes from 'jsbarcode/bin/barcodes';
import { fail, ok, type ToolResult } from './result';

// ── QR ───────────────────────────────────────────────────────────────

export type QrLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  size: number;
  /** `dark[fila][columna]`. */
  dark: boolean[][];
  version: number;
}

const utf8Bytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** La matriz del QR, en UTF-8 (tildes, eñes y emojis se leen bien en
 *  cualquier lector actual). `null` si el texto no cabe en un QR. */
export function qrMatrix(text: string, level: QrLevel): ToolResult<QrMatrix> {
  try {
    const qr = qrcode(0, level);
    // Byte con los bytes UTF-8 ya hechos: el modo por defecto de la
    // librería corta cada carácter a 8 bits.
    const bytes = utf8Bytes(text);
    qr.addData(String.fromCharCode(...bytes), 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const dark = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => qr.isDark(r, c)));
    return ok({ size, dark, version: (size - 17) / 4 });
  } catch {
    return fail('qr-too-long');
  }
}

/** Bytes que caben como mucho (versión 40) según el nivel de corrección. */
export const QR_MAX_BYTES: Record<QrLevel, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
export const qrByteLength = (text: string) => new TextEncoder().encode(text).length;

export interface QrSvgOptions {
  /** Píxeles por módulo. */
  scale: number;
  /** Módulos de margen (la norma pide 4). */
  margin: number;
}

export function qrSvg(m: QrMatrix, opts: QrSvgOptions): string {
  const total = m.size + opts.margin * 2;
  const px = total * opts.scale;
  // Un solo path con un rectángulo por módulo oscuro: liviano y nítido.
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark[r][c]) d += `M${c + opts.margin} ${r + opts.margin}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`
  );
}

// ── Códigos de barras ────────────────────────────────────────────────

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'codabar';
export const BARCODE_FORMATS: readonly BarcodeFormat[] = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14', 'codabar'];

export interface EncodedBarcode {
  /** '1' barra, '0' espacio, de un módulo cada uno. */
  bits: string;
  /** El texto que va debajo (con el dígito de control si lo calcula). */
  text: string;
}

interface Encoder {
  valid(): boolean;
  encode(): { data: string; text: string } | { data: string; text: string }[];
}
type EncoderClass = new (data: string, options: Record<string, unknown>) => Encoder;

export function encodeBarcode(value: string, format: BarcodeFormat): ToolResult<EncodedBarcode> {
  if (!value) return fail('barcode-invalid');
  const Cls = (barcodes as Record<string, EncoderClass>)[format];
  try {
    const encoder = new Cls(value, { flat: true, text: undefined, displayValue: true, mod43: false });
    if (!encoder.valid()) return fail('barcode-invalid', { detail: format });
    const out = encoder.encode();
    const parts = Array.isArray(out) ? out : [out];
    return ok({ bits: parts.map((p) => p.data).join(''), text: parts.map((p) => p.text).join('') || value });
  } catch {
    return fail('barcode-invalid', { detail: format });
  }
}

export interface BarcodeSvgOptions {
  /** Ancho de una barra mínima, en px. */
  barWidth: number;
  height: number;
  showText: boolean;
  /** Margen a cada lado, en px (la zona de silencio). */
  margin: number;
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

export function barcodeSvg(code: EncodedBarcode, opts: BarcodeSvgOptions): string {
  const textHeight = opts.showText ? 20 : 0;
  const width = code.bits.length * opts.barWidth + opts.margin * 2;
  const height = opts.height + textHeight + opts.margin * 2;
  let rects = '';
  let i = 0;
  while (i < code.bits.length) {
    if (code.bits[i] === '1') {
      let j = i;
      while (code.bits[j] === '1') j++;
      rects += `<rect x="${opts.margin + i * opts.barWidth}" y="${opts.margin}" width="${(j - i) * opts.barWidth}" height="${opts.height}"/>`;
      i = j;
    } else i++;
  }
  const text = opts.showText
    ? `<text x="${width / 2}" y="${opts.margin + opts.height + 16}" text-anchor="middle" font-family="monospace" font-size="16">${escapeXml(code.text)}</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/><g fill="#000000">${rects}${text}</g></svg>`
  );
}
