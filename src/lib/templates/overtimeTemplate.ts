// Motor de la plantilla del Excel de horas extra (logday-server
// specs/plantillas, design §3). Llena un `.xlsx` hecho en Excel con
// marcadores `{{…}}` y repite la fila de datos una vez por registro.
//
// Trabaja sobre el XML del libro, no con SheetJS: así todo lo que no es un
// marcador (estilos, logos, otras hojas, formato condicional) pasa sin
// tocar. Solo usa fflate y nada de la app: el mismo archivo va en Desktop,
// Web y Mobile.
//
// Lo que hace:
// - Valores sueltos (`{{mes}}`, `{{colaborador}}`, `{{total.horas}}`…) en
//   cualquier celda de texto de cualquier hoja.
// - La fila de datos es la primera fila con un `{{fila.…}}`. Se copia una
//   vez por registro (o se deja una vacía si el mes no tiene) y todo lo de
//   abajo baja.
// - Las fórmulas, las celdas combinadas, el formato condicional, las
//   validaciones, los vínculos, la dimensión y los nombres definidos de esa
//   hoja se corren con las filas. Un rango que abarca la fila de datos
//   crece (`SUM(G8:G8)` → `SUM(G8:G10)`) y, en cada copia, las referencias
//   relativas a la fila de datos pasan a la fila de la copia.
// - Una celda con un solo marcador numérico queda como número, con el
//   formato de la plantilla; lo demás queda como texto. Un valor nunca se
//   escribe como fórmula, aunque empiece con `=`.
// - Se borra `calcChain.xml` y se pide recalcular al abrir.
//
// No valida la plantilla (v1, sin comprobaciones). Lo que no entiende lo
// deja como está. Límites conocidos: las imágenes ancladas debajo de la
// fila de datos no se corren, y una fórmula compartida (`t="shared"`) en
// la fila de datos solo se conserva en su celda maestra.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface OvertimeTemplateEntry {
  fecha: string;           // YYYY-MM-DD
  solicitadaPor: string;
  actividad: string;
  observaciones: string;   // 'comp' | 'pay' | 'other' o texto libre
  horaInicio: string;      // HH:MM
  horaFinal: string;       // HH:MM
  totalHoras: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasFestivas: number;
  extrasNocturnasFestivas: number;
}

export interface OvertimeTemplateData {
  /** "Noviembre 2026", el mismo texto que usa el Excel Legacy. */
  mes: string;
  colaborador: string;
  cedula: string;
  entries: OvertimeTemplateEntry[];
}

/** Los marcadores, para la ayuda de Opciones → Plantillas. */
export const OVERTIME_TEMPLATE_MARKERS = {
  values: ['mes', 'colaborador', 'cedula', 'total.horas', 'total.diurnas', 'total.nocturnas', 'total.diurnas_festivas', 'total.nocturnas_festivas'],
  row: [
    'fila.fecha', 'fila.solicitada_por', 'fila.actividad', 'fila.observaciones', 'fila.hora_inicio', 'fila.hora_final',
    'fila.total', 'fila.diurnas', 'fila.nocturnas', 'fila.diurnas_festivas', 'fila.nocturnas_festivas',
  ],
} as const;

type Value = string | number;

// ── Valores ───────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → número de serie de Excel, en UTC (como `parseFecha` del
 *  Excel Legacy: con `Date` local se corre un día en UTC-5). */
function excelDate(s: string): number | string {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** "HH:MM" → fracción de día. */
function excelTime(s: string): number | string {
  const [h, min] = (s || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return s;
  return (h * 3600 + min * 60) / 86400;
}

const OBSERVACIONES: Record<string, string> = { comp: 'Compensatorio', pay: 'Pago', other: 'Otro' };

function rowValues(e: OvertimeTemplateEntry | null): Record<string, Value> {
  if (!e) return Object.fromEntries(OVERTIME_TEMPLATE_MARKERS.row.map((k) => [k, '']));
  return {
    'fila.fecha': excelDate(e.fecha),
    'fila.solicitada_por': e.solicitadaPor,
    'fila.actividad': e.actividad,
    'fila.observaciones': OBSERVACIONES[e.observaciones] ?? e.observaciones,
    'fila.hora_inicio': excelTime(e.horaInicio),
    'fila.hora_final': excelTime(e.horaFinal),
    'fila.total': e.totalHoras,
    'fila.diurnas': e.extrasDiurnas,
    'fila.nocturnas': e.extrasNocturnas,
    'fila.diurnas_festivas': e.extrasDiurnasFestivas,
    'fila.nocturnas_festivas': e.extrasNocturnasFestivas,
  };
}

function scalarValues(data: OvertimeTemplateData): Record<string, Value> {
  const sum = (f: (e: OvertimeTemplateEntry) => number) => data.entries.reduce((acc, e) => acc + (f(e) || 0), 0);
  return {
    mes: data.mes,
    colaborador: data.colaborador,
    cedula: data.cedula,
    'total.horas': sum((e) => e.totalHoras),
    'total.diurnas': sum((e) => e.extrasDiurnas),
    'total.nocturnas': sum((e) => e.extrasNocturnas),
    'total.diurnas_festivas': sum((e) => e.extrasDiurnasFestivas),
    'total.nocturnas_festivas': sum((e) => e.extrasNocturnasFestivas),
  };
}

// ── XML ───────────────────────────────────────────────────────────────────

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[\da-fA-F]+);/g, (m, e: string) => {
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'amp') return '&';
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

// Fuera de tab, salto de línea y retorno, los caracteres de control no
// valen en XML 1.0: Excel no abriría el libro.
// eslint-disable-next-line no-control-regex
const escapeXml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function setAttr(tag: string, name: string, value: string | null): string {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (value === null) return tag.replace(re, '');
  if (re.test(tag)) return tag.replace(re, ` ${name}="${value}"`);
  return tag.replace(/^<([\w:]+)/, `<$1 ${name}="${value}"`);
}

/** El texto de un `<si>` o `<is>`: todos sus `<t>`, sin la fonética. */
function richText(xml: string): string {
  const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of plain.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decodeXml(m[1] ?? '');
  return out;
}

// ── Referencias A1 ────────────────────────────────────────────────────────

interface Shift {
  /** La fila de datos de la plantilla. */
  dataRow: number;
  /** Cuántas filas bajan las de abajo (copias − 1). */
  delta: number;
  /** En una copia de la fila de datos, su índice; si no, `null`. */
  copy: number | null;
}

interface RowRef { abs: boolean; row: number }

/** Una fila suelta: baja si está debajo de la fila de datos; en una copia,
 *  la referencia relativa a la fila de datos pasa a la de la copia. */
function moveRow(ref: RowRef, sh: Shift): number {
  if (sh.copy !== null && !ref.abs && ref.row === sh.dataRow) return ref.row + sh.copy;
  return ref.row > sh.dataRow ? ref.row + sh.delta : ref.row;
}

/** Un rango de filas: si abarca la fila de datos, crece. */
function moveRange(a: RowRef, b: RowRef, sh: Shift): [number, number] {
  const [lo, hi] = a.row <= b.row ? [a, b] : [b, a];
  const inCopy = sh.copy !== null && lo.row === sh.dataRow && hi.row === sh.dataRow && !lo.abs && !hi.abs;
  if (inCopy) return [moveRow(lo, sh), moveRow(hi, sh)];
  if (lo.row <= sh.dataRow && hi.row >= sh.dataRow) return [lo.row, hi.row + sh.delta];
  return [moveRow(lo, sh), moveRow(hi, sh)];
}

const CELL = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/;

function moveCellRange(text: string, sh: Shift): string {
  const [a, b] = text.split(':');
  const ma = CELL.exec(a);
  if (!ma) return text;
  if (b === undefined) {
    const row = moveRow({ abs: ma[3] === '$', row: Number(ma[4]) }, sh);
    return `${ma[1]}${ma[2]}${ma[3]}${row}`;
  }
  const mb = CELL.exec(b);
  if (!mb) return text;
  const [ra, rb] = moveRange({ abs: ma[3] === '$', row: Number(ma[4]) }, { abs: mb[3] === '$', row: Number(mb[4]) }, sh);
  return `${ma[1]}${ma[2]}${ma[3]}${ra}:${mb[1]}${mb[2]}${mb[3]}${rb}`;
}

/** Una lista de rangos separados por espacios (`sqref`, `ref`). */
const moveSqref = (sqref: string, sh: Shift) => sqref.split(/\s+/).map((r) => moveCellRange(r, sh)).join(' ');

/** Las referencias A1 de una fórmula. No toca el texto entre comillas ni
 *  las referencias a otras hojas; `sheet` es el nombre de esta hoja. Con
 *  `rowRanges`, también los rangos de filas (`$6:$7`, en los nombres). */
function moveFormula(formula: string, sheet: string, sh: Shift, rowRanges = false): string {
  const REF = /(^|[^A-Za-z0-9_.$!'])((?:'(?:[^']|'')+'|[A-Za-z0-9_.]+)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![A-Za-z0-9_(])/g;
  const ROWS = /(^|[^A-Za-z0-9_.$!'])((?:'(?:[^']|'')+'|[A-Za-z0-9_.]+)!)?(\$?)(\d+):(\$?)(\d+)(?![\d])/g;
  const sameSheet = (prefix: string | undefined) => {
    if (!prefix) return true;
    const name = prefix.slice(0, -1);
    const plain = name.startsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name;
    return plain === sheet;
  };
  return formula
    .split('"')
    .map((part, i) => {
      if (i % 2 === 1) return part; // texto entre comillas
      let out = part.replace(REF, (m, pre: string, prefix: string | undefined, ref: string) =>
        sameSheet(prefix) ? `${pre}${prefix ?? ''}${moveCellRange(ref, sh)}` : m);
      if (rowRanges) {
        out = out.replace(ROWS, (m, pre: string, prefix: string | undefined, a1: string, r1: string, a2: string, r2: string) => {
          if (!sameSheet(prefix)) return m;
          const [x, y] = moveRange({ abs: a1 === '$', row: Number(r1) }, { abs: a2 === '$', row: Number(r2) }, sh);
          return `${pre}${prefix ?? ''}${a1}${x}:${a2}${y}`;
        });
      }
      return out;
    })
    .join('"');
}

// ── Celdas ────────────────────────────────────────────────────────────────

const MARKER = /\{\{\s*([\w.]+)\s*\}\}/g;
const HAS_MARKER = /\{\{\s*[\w.]+\s*\}\}/;
const ONLY_MARKER = /^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/;

interface Cell {
  raw: string;
  open: string;     // la etiqueta de apertura (o la autocerrada)
  body: string;     // lo de adentro ('' si es autocerrada)
  col: string;
  row: number;
}

function parseCells(rowBody: string): Cell[] {
  const cells: Cell[] = [];
  for (const m of rowBody.matchAll(/<c\b[^>]*?\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
    const raw = m[0];
    const open = /^<c\b[^>]*?\/?>/.exec(raw)![0];
    const body = open.endsWith('/>') ? '' : raw.slice(open.length, -4);
    const ref = /^([A-Z]+)(\d+)$/.exec(attr(open, 'r') ?? '');
    cells.push({ raw, open, body, col: ref ? ref[1] : '', row: ref ? Number(ref[2]) : 0 });
  }
  return cells;
}

function cellText(cell: Cell, shared: string[]): string | null {
  const t = attr(cell.open, 't');
  if (t === 's') {
    const v = /<v>([\s\S]*?)<\/v>/.exec(cell.body);
    return v ? (shared[Number(v[1])] ?? null) : null;
  }
  if (t === 'inlineStr') {
    const is = /<is>([\s\S]*?)<\/is>/.exec(cell.body);
    return is ? richText(is[1]) : null;
  }
  return null;
}

/** La celda con sus marcadores llenos (o tal cual si no tiene). */
function fillCell(cell: Cell, text: string | null, values: Record<string, Value>, ref: string): string {
  let open = setAttr(cell.open.replace(/\/>$/, '>'), 'r', ref);
  if (text === null || !HAS_MARKER.test(text)) {
    return cell.open.endsWith('/>') ? `${open.slice(0, -1)}/>` : `${open}${cell.body}</c>`;
  }
  const only = ONLY_MARKER.exec(text);
  const single = only ? values[only[1]] : undefined;
  if (typeof single === 'number' && Number.isFinite(single)) {
    open = setAttr(open, 't', null);
    return `${open}<v>${single}</v></c>`;
  }
  const filled = text.replace(MARKER, (_m, name: string) => {
    const v = values[name];
    return v === undefined ? '' : String(v);
  });
  if (filled === '') return `${setAttr(open, 't', null).slice(0, -1)}/>`;
  open = setAttr(open, 't', 'inlineStr');
  return `${open}<is><t xml:space="preserve">${escapeXml(filled)}</t></is></c>`;
}

/** Una celda con fórmula: se mueven sus referencias y se borra el valor en
 *  caché (Excel recalcula al abrir). */
function moveFormulaCell(cell: Cell, sheet: string, sh: Shift, ref: string, cloned: boolean): string {
  let open = setAttr(cell.open, 'r', ref);
  let body = cell.body.replace(/<v>[\s\S]*?<\/v>/, '');
  body = body.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/, (_m, attrs: string, f: string) => {
    let a = attrs;
    const refAttr = /\sref="([^"]*)"/.exec(a);
    if (refAttr) a = a.replace(refAttr[0], ` ref="${moveSqref(refAttr[1], sh)}"`);
    // En una copia, una fórmula compartida maestra pasa a ser normal: si no,
    // habría varias maestras con el mismo `si`.
    if (cloned && /\st="shared"/.test(a)) a = a.replace(/\s(t|ref|si)="[^"]*"/g, '');
    return `<f${a}>${moveFormula(f, sheet, sh)}</f>`;
  });
  if (attr(open, 't') === 'str' && !/<f\b/.test(body)) open = setAttr(open, 't', null);
  return `${open}${body}</c>`;
}

// ── Hojas ─────────────────────────────────────────────────────────────────

interface Row { open: string; body: string; num: number }

function parseRows(sheetData: string): Row[] {
  const rows: Row[] = [];
  let next = 1;
  for (const m of sheetData.matchAll(/<row\b[^>]*?\/>|<row\b[^>]*>[\s\S]*?<\/row>/g)) {
    const raw = m[0];
    const open = /^<row\b[^>]*?\/?>/.exec(raw)![0];
    const body = open.endsWith('/>') ? '' : raw.slice(open.length, -6);
    const num = Number(attr(open, 'r') ?? next);
    next = num + 1;
    rows.push({ open, body, num });
  }
  return rows;
}

function hasRowMarker(row: Row, shared: string[]): boolean {
  return parseCells(row.body).some((c) => (cellText(c, shared) ?? '').includes('{{fila.'));
}

function renderRow(row: Row, newNum: number, sheet: string, sh: Shift, shared: string[], values: Record<string, Value>): string {
  const cells = parseCells(row.body).map((cell) => {
    const ref = `${cell.col}${newNum}`;
    if (/<f\b/.test(cell.body)) return moveFormulaCell(cell, sheet, sh, ref, sh.copy !== null && sh.copy > 0);
    return fillCell(cell, cellText(cell, shared), values, ref);
  });
  const open = setAttr(row.open.replace(/\/>$/, '>'), 'r', String(newNum));
  return `${open}${cells.join('')}</row>`;
}

function fillSheet(xml: string, sheet: string, shared: string[], data: OvertimeTemplateData, scalars: Record<string, Value>, isDataSheet: boolean): { xml: string; shift: Shift | null } {
  const sd = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/.exec(xml);
  if (!sd) return { xml, shift: null };
  const rows = parseRows(sd[1] ?? '');
  const dataIndex = isDataSheet ? rows.findIndex((r) => hasRowMarker(r, shared)) : -1;
  const copies = Math.max(data.entries.length, 1);
  const base: Shift = dataIndex >= 0 ? { dataRow: rows[dataIndex].num, delta: copies - 1, copy: null } : { dataRow: Number.MAX_SAFE_INTEGER, delta: 0, copy: null };

  const out: string[] = [];
  for (const row of rows) {
    if (dataIndex >= 0 && row.num === base.dataRow) {
      for (let i = 0; i < copies; i++) {
        const sh = { ...base, copy: i };
        const values = { ...scalars, ...rowValues(data.entries[i] ?? null) };
        out.push(renderRow(row, base.dataRow + i, sheet, sh, shared, values));
      }
    } else {
      out.push(renderRow(row, moveRow({ abs: true, row: row.num }, base), sheet, base, shared, scalars));
    }
  }
  let result = xml.slice(0, sd.index) + `<sheetData>${out.join('')}</sheetData>` + xml.slice(sd.index + sd[0].length);
  if (dataIndex < 0) return { xml: result, shift: null };

  // Lo que está fuera de `sheetData` y apunta a celdas de esta hoja.
  result = result
    .replace(/<dimension\s+ref="([^"]*)"/, (_m, ref: string) => `<dimension ref="${moveSqref(ref, base)}"`)
    .replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/, (_m, inner: string) => {
      const refs: string[] = [];
      for (const mc of inner.matchAll(/<mergeCell\s+ref="([^"]*)"\s*\/>/g)) {
        const [a, b] = mc[1].split(':');
        const ra = Number(/\d+$/.exec(a)?.[0]);
        const rb = Number(/\d+$/.exec(b ?? a)?.[0]);
        if (ra === base.dataRow && rb === base.dataRow) {
          // Una combinada dentro de la fila de datos se repite en cada copia.
          for (let i = 0; i < copies; i++) refs.push(moveCellRange(mc[1], { ...base, copy: i }));
        } else {
          refs.push(moveCellRange(mc[1], base));
        }
      }
      return `<mergeCells count="${refs.length}">${refs.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;
    })
    .replace(/(<(?:conditionalFormatting|dataValidation|selection|protectedRange)\b[^>]*\ssqref=")([^"]*)"/g, (_m, pre: string, sq: string) => `${pre}${moveSqref(sq, base)}"`)
    .replace(/(<hyperlink\b[^>]*\sref=")([^"]*)"/g, (_m, pre: string, ref: string) => `${pre}${moveSqref(ref, base)}"`)
    .replace(/<(formula|formula1|formula2)>([\s\S]*?)<\/\1>/g, (_m, tag: string, f: string) => `<${tag}>${escapeXml(moveFormula(decodeXml(f), sheet, base))}</${tag}>`)
    .replace(/(<pane\b[^>]*\stopLeftCell=")([^"]*)"/, (_m, pre: string, ref: string) => `${pre}${moveSqref(ref, base)}"`);
  return { xml: result, shift: base };
}

// ── Libro ─────────────────────────────────────────────────────────────────

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

export function fillOvertimeTemplate(template: Uint8Array, data: OvertimeTemplateData): Uint8Array {
  const files = unzipSync(template);
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const write = (path: string, xml: string) => {
    files[path] = strToU8(xml);
  };

  const sorted: OvertimeTemplateData = {
    ...data,
    entries: [...data.entries].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)),
  };
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => richText(m[1] ?? ''));
  const scalars = scalarValues(sorted);

  let workbook = read('xl/workbook.xml') ?? '';
  const rels = read('xl/_rels/workbook.xml.rels') ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, resolveTarget(target));
  }

  // La primera hoja que tenga la fila de datos es la que la repite.
  let dataSheet: { name: string; index: number; shift: Shift } | null = null;
  [...workbook.matchAll(/<sheet\b[^>]*>/g)].forEach((m, index) => {
    const name = decodeXml(attr(m[0], 'name') ?? '');
    const path = targets.get(attr(m[0], 'r:id') ?? '');
    const xml = path ? read(path) : null;
    if (!path || xml === null) return;
    const { xml: filled, shift } = fillSheet(xml, name, shared, sorted, scalars, dataSheet === null);
    if (shift && !dataSheet) dataSheet = { name, index, shift };
    write(path, filled);
  });

  // Nombres definidos de esa hoja (área de impresión, títulos).
  const ds = dataSheet as { name: string; index: number; shift: Shift } | null;
  if (ds) {
    workbook = workbook.replace(/(<definedName\b[^>]*>)([\s\S]*?)(<\/definedName>)/g, (_m, open: string, f: string, close: string) =>
      `${open}${escapeXml(moveFormula(decodeXml(f), ds.name, ds.shift, true))}${close}`);
  }

  // Las posiciones cambiaron: fuera la cadena de cálculo, y que Excel
  // recalcule al abrir (las fórmulas quedaron sin valor en caché).
  if (files['xl/calcChain.xml']) {
    delete files['xl/calcChain.xml'];
    write('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/g, ''));
    const types = read('[Content_Types].xml');
    if (types) write('[Content_Types].xml', types.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ''));
  }
  if (/<calcPr\b/.test(workbook)) {
    workbook = workbook.replace(/<calcPr\b[^>]*?\/?>/, (tag) => setAttr(tag, 'fullCalcOnLoad', '1'));
  } else {
    const anchor = /<\/definedNames>/.test(workbook) ? '</definedNames>' : '</sheets>';
    workbook = workbook.replace(anchor, `${anchor}<calcPr fullCalcOnLoad="1"/>`);
  }
  write('xl/workbook.xml', workbook);

  return zipSync(files);
}

/** Exportado para las pruebas. */
export const __test = { moveFormula, moveCellRange };
