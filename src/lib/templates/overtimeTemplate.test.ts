import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { base64ToBytes, bytesToBase64, logdayOvertimeTemplate } from './logdayOvertimeXlsx';
import { __test, fillOvertimeTemplate, type OvertimeTemplateEntry } from './overtimeTemplate';

const entry = (fecha: string, extra: Partial<OvertimeTemplateEntry> = {}): OvertimeTemplateEntry => ({
  fecha,
  solicitadaPor: 'Carlos',
  actividad: 'Despliegue',
  observaciones: 'comp',
  horaInicio: '18:00',
  horaFinal: '21:00',
  totalHoras: 3,
  extrasDiurnas: 1,
  extrasNocturnas: 2,
  extrasDiurnasFestivas: 0,
  extrasNocturnasFestivas: 0,
  ...extra,
});

const data = (entries: OvertimeTemplateEntry[]) => ({ mes: 'Noviembre 2026', colaborador: 'Ana Gómez', cedula: '123', entries });

function sheetOf(bytes: Uint8Array) {
  const wb = XLSX.read(bytes, { type: 'array', cellFormula: true, cellStyles: true });
  return wb.Sheets[wb.SheetNames[0]];
}

describe('moveFormula', () => {
  const { moveFormula } = __test;
  const sh = { dataRow: 8, delta: 2, copy: null };

  it('corre lo de abajo, estira lo que abarca la fila de datos y deja lo de arriba', () => {
    expect(moveFormula('SUM(G8:G8)', 'Hoja', sh)).toBe('SUM(G8:G10)');
    expect(moveFormula('A9+$B$12', 'Hoja', sh)).toBe('A11+$B$14');
    expect(moveFormula('A3*2', 'Hoja', sh)).toBe('A3*2');
    expect(moveFormula('SUM(A1:A20)', 'Hoja', sh)).toBe('SUM(A1:A22)');
  });

  it('en una copia, lo relativo a la fila de datos pasa a la de la copia', () => {
    expect(moveFormula('SUM(H8:K8)', 'Hoja', { ...sh, copy: 2 })).toBe('SUM(H10:K10)');
    expect(moveFormula('H$8*2', 'Hoja', { ...sh, copy: 2 })).toBe('H$8*2');
  });

  it('no toca texto entre comillas, funciones ni otras hojas', () => {
    expect(moveFormula('IF(A9>0,"B9","x")', 'Hoja', sh)).toBe('IF(A11>0,"B9","x")');
    expect(moveFormula('LOG10(A9)', 'Hoja', sh)).toBe('LOG10(A11)');
    expect(moveFormula("Otra!A9+'Hoja'!A9", 'Hoja', sh)).toBe("Otra!A9+'Hoja'!A11");
  });

  it('los rangos de filas de un nombre definido', () => {
    expect(moveFormula("'Horas extra'!$6:$7", 'Horas extra', sh, true)).toBe("'Horas extra'!$6:$7");
    expect(moveFormula("'Horas extra'!$A$1:$K$12", 'Horas extra', sh, true)).toBe("'Horas extra'!$A$1:$K$14");
  });
});

describe('fillOvertimeTemplate con la plantilla de Logday', () => {
  it('llena la cabecera y una fila por registro, ordenadas', () => {
    const out = fillOvertimeTemplate(logdayOvertimeTemplate(), data([entry('2026-11-09'), entry('2026-11-03', { observaciones: 'pay' })]));
    const ws = sheetOf(out);
    expect(ws.A1.v).toBe('Horas extra — Noviembre 2026');
    expect(ws.B3.v).toBe('Ana Gómez');
    expect(ws.B4.v).toBe('123');
    // Fecha como número de serie (3 nov 2026 = 46329) y hora como fracción.
    expect(ws.A8.t).toBe('n');
    expect(ws.A8.v).toBe(46329);
    expect(ws.A9.v).toBe(46335);
    expect(ws.D8.v).toBe('Pago');
    expect(ws.D9.v).toBe('Compensatorio');
    expect(ws.E8.v).toBeCloseTo(0.75);
    expect(ws.H8.v).toBe(1);
    // Cada copia con su fórmula, y los totales estirados.
    expect(ws.G8.f).toBe('SUM(H8:K8)');
    expect(ws.G9.f).toBe('SUM(H9:K9)');
    expect(ws.F10.v).toBe('Total');
    expect(ws.G10.f).toBe('SUM(G8:G9)');
    expect(ws.K10.f).toBe('SUM(K8:K9)');
    // La nota bajó con las filas y su combinada también.
    expect(String(ws.A12.v)).toContain('Diurnas');
    expect(ws['!merges']!.map((m: XLSX.Range) => XLSX.utils.encode_range(m))).toContain('A12:K12');
  });

  it('conserva el formato de las celdas de la plantilla', () => {
    const ws = sheetOf(fillOvertimeTemplate(logdayOvertimeTemplate(), data([entry('2026-11-03')])));
    expect(ws.A8.z).toBe('dd/mm/yyyy');
    expect(ws.E8.z).toBe('h:mm AM/PM');
  });

  it('un mes sin registros deja una fila vacía y los totales en su sitio', () => {
    const ws = sheetOf(fillOvertimeTemplate(logdayOvertimeTemplate(), data([])));
    expect(ws.A8?.v ?? '').toBe('');
    expect(ws.C8?.v ?? '').toBe('');
    expect(ws.G9.f).toBe('SUM(G8:G8)');
  });

  it('Observaciones en otro idioma', () => {
    const ws = sheetOf(fillOvertimeTemplate(logdayOvertimeTemplate(), { ...data([entry('2026-11-03')]), observacionesLabels: { comp: 'Time off' } }));
    expect(ws.D8.v).toBe('Time off');
  });

  it('un valor que empieza con = queda como texto, nunca como fórmula', () => {
    const ws = sheetOf(fillOvertimeTemplate(logdayOvertimeTemplate(), data([entry('2026-11-03', { actividad: '=HYPERLINK("http://x")' })])));
    expect(ws.C8.t).toBe('s');
    expect(ws.C8.f).toBeUndefined();
    expect(ws.C8.v).toBe('=HYPERLINK("http://x")');
  });

  it('pide recalcular al abrir y escapa el XML', () => {
    const out = fillOvertimeTemplate(logdayOvertimeTemplate(), data([entry('2026-11-03', { actividad: 'A & B <c>' })]));
    const files = unzipSync(out);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('fullCalcOnLoad="1"');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('A &amp; B &lt;c&gt;');
  });
});

describe('fillOvertimeTemplate con una plantilla propia', () => {
  // Una plantilla mínima hecha a mano: cadenas compartidas, una celda con
  // texto y marcador, calcChain y formato condicional debajo.
  function custom(): Uint8Array {
    const types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>';
    const rootRels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>';
    const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>';
    const shared = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>Reporte de {{colaborador}}</t></si><si><r><t>{{fila.</t></r><r><t>actividad}}</t></r></si><si><t>{{fila.total}}</t></si><si><t>{{otra.cosa}}</t></si></sst>';
    const sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C4"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row><row r="4"><c r="B4"><f>SUM(B2:B2)</f><v>0</v></c></row></sheetData><conditionalFormatting sqref="B4"><cfRule type="cellIs" priority="1" operator="greaterThan"><formula>$B$4</formula></cfRule></conditionalFormatting></worksheet>';
    return zipSync({
      '[Content_Types].xml': strToU8(types),
      '_rels/.rels': strToU8(rootRels),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(rels),
      'xl/sharedStrings.xml': strToU8(shared),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
      'xl/calcChain.xml': strToU8('<?xml version="1.0"?><calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="B4" i="1"/></calcChain>'),
    });
  }

  it('lee cadenas compartidas con varios tramos y corre lo de fuera de sheetData', () => {
    const out = fillOvertimeTemplate(custom(), data([entry('2026-11-03', { totalHoras: 2 }), entry('2026-11-04', { totalHoras: 5, actividad: 'Soporte' })]));
    const files = unzipSync(out);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Reporte de Ana Gómez</t></is></c>');
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">Soporte</t></is></c>');
    expect(sheet).toContain('<c r="B3"><v>5</v></c>');
    // Un marcador desconocido deja la celda vacía.
    expect(sheet).toContain('<c r="C2"/>');
    expect(sheet).toContain('<row r="5"><c r="B5"><f>SUM(B2:B3)</f></c></row>');
    expect(sheet).toContain('<dimension ref="A1:C5"/>');
    expect(sheet).toContain('<conditionalFormatting sqref="B5">');
    expect(sheet).toContain('<formula>$B$5</formula>');
    // Sin calcChain y con recálculo al abrir.
    expect(files['xl/calcChain.xml']).toBeUndefined();
    expect(strFromU8(files['xl/_rels/workbook.xml.rels'])).not.toContain('calcChain');
    expect(strFromU8(files['[Content_Types].xml'])).not.toContain('calcChain');
    expect(strFromU8(files['xl/workbook.xml'])).toContain('<calcPr fullCalcOnLoad="1" calcId="191029"/>');
  });
});

describe('base64', () => {
  it('va y vuelve', () => {
    for (const bytes of [new Uint8Array([]), new Uint8Array([1]), new Uint8Array([1, 2]), new Uint8Array([0, 255, 128, 7])]) {
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });
});
