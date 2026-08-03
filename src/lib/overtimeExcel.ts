import { OvertimeEntry, OvertimeMonthMeta } from '../types/overtime';
// ── Tipos ─────────────────────────────────────────────────────────────────────

type BorderSide = { style: string; color: { rgb: string } };
type CellStyle = {
  font?: { bold?: boolean; italic?: boolean; sz?: number; color?: { rgb: string }; name?: string };
  fill?: { fgColor: { rgb: string }; patternType?: string };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: { top?: BorderSide; bottom?: BorderSide; left?: BorderSide; right?: BorderSide };
  numFmt?: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ws = Record<string, any>;

// ── Constantes de estilo ──────────────────────────────────────────────────────

const THIN: BorderSide = { style: 'thin', color: { rgb: '000000' } };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

const CLR = {
  white:  'FFFFFF',
  orange: 'FCE4D6',  // encabezados / labels
  green:  'C6E0B4',  // leyenda
} as const;

// ── Utilidades de dirección ───────────────────────────────────────────────────

/** Índice de columna 0-based → letra(s) Excel */
function colL(c: number): string {
  let s = '';
  let n = c;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

/** (rowIndex 0-based, colIndex 0-based) → dirección Excel "A1" */
function cellAddr(r: number, c: number): string {
  return `${colL(c)}${r + 1}`;
}

// ── Conversión de fechas/horas ────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" → número de serie de Excel (fracción de día desde el
 * epoch de Excel). Se calcula a mano en vez de pasar un objeto `Date`
 * en la celda: xlsx-js-style convierte `Date` a serie asumiendo la hora
 * local, y en zonas horarias detrás de UTC (ej. UTC-5) eso corre la
 * fecha mostrada un día hacia atrás. Mismo enfoque que `parseHora` ya
 * usa para evitar el problema equivalente con horas.
 */
function parseFecha(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d);
  const excelEpochMs = Date.UTC(1899, 11, 30);
  return (utcMs - excelEpochMs) / 86400000;
}

const OBSERVACIONES_LABELS: Record<string, string> = {
  comp: 'Compensatorio',
  pay: 'Pago',
  other: 'Otro',
};

/** Clave interna ('comp'/'pay'/'other') → etiqueta en español; texto libre se deja tal cual. */
function formatObservaciones(v: string): string {
  return OBSERVACIONES_LABELS[v] ?? v;
}

/**
 * "HH:MM" → número serial de Excel (fracción de día).
 * Excel almacena el tiempo como fracción de 24h: 7:00 AM = 7/24.
 * Usar tipo 'n' con numFmt horario evita que aparezca la fecha de época.
 */
function parseHora(s: string): number {
  const [h, min] = (s || '00:00').split(':').map(Number);
  return (h * 3600 + min * 60) / 86400;
}

// ── Helper: setStyle ──────────────────────────────────────────────────────────

/**
 * Aplica/fusiona un estilo sobre una celda existente.
 * Si la celda no existe la inicializa como cadena vacía.
 * No reemplaza estilos previos — hace merge.
 */
function setStyle(ws: Ws, address: string, style: CellStyle): void {
  if (!ws[address]) ws[address] = { t: 's', v: '' };
  ws[address].s = { ...(ws[address].s ?? {}), ...style };
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function generateOvertimeXlsx(
  entries: OvertimeEntry[],
  meta: OvertimeMonthMeta,
  mesLabel: string,
): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = await import('xlsx-js-style') as any;

  const ws: Ws = {};

  /**
   * Helper: applyRangeStyle
   * Aplica un estilo a todas las celdas de un rango "A1:K5".
   * Usa XLSX.utils.decode_range para iterar.
   */
  function applyRangeStyle(range: string, style: CellStyle): void {
    const decoded = XLSX.utils.decode_range(range);
    for (let r = decoded.s.r; r <= decoded.e.r; r++) {
      for (let c = decoded.s.c; c <= decoded.e.c; c++) {
        setStyle(ws, cellAddr(r, c), style);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 1 — Título
  // C1 merge C1:H1, negrita, sz 14, centrado
  // ─────────────────────────────────────────────────────────────────────────

  const tituloStyle: CellStyle = {
    font: { bold: true, sz: 14, color: { rgb: '000000' }, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.white }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  ws['C1'] = { t: 's', v: `REPORTE HORAS EXTRAS - ${mesLabel}`, s: tituloStyle };
  // D1:H1 vacías para rellenar el merge
  for (let c = 3; c <= 7; c++) ws[cellAddr(0, c)] = { t: 's', v: '', s: tituloStyle };
  // no-op para conservar el helper applyRangeStyle sin alterar el resultado
  applyRangeStyle('C1:C1', {});

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 2 — Cabecera colaborador (filas 3–4)
  // A = label (negrita, fondo naranja), B = valor
  // ─────────────────────────────────────────────────────────────────────────

  const sLabelMeta: CellStyle = {
    font: { bold: true, sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.orange }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDERS,
  };
  const sValueMeta: CellStyle = {
    font: { sz: 11, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDERS,
  };

  ws['A3'] = { t: 's', v: 'NOMBRE COLABORADOR', s: sLabelMeta };
  ws['B3'] = { t: 's', v: meta.colaborador,      s: sValueMeta };
  ws['A4'] = { t: 's', v: 'CEDULA',              s: sLabelMeta };
  ws['B4'] = { t: 's', v: meta.cedula,            s: sValueMeta };

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 3 — Encabezados de tabla (fila 5, A5:K5)
  // negrita, fondo naranja, centrado, wrapText, borde fino
  // ─────────────────────────────────────────────────────────────────────────

  const HEADERS = [
    'Fecha',
    'Solicitada por:',
    'Actividad Realizada',
    'Observaciones (Compensatorio o Pago)',
    'Hora inicio',
    'Hora final',
    'Total Horas',
    'Horas Extras Diurnas',
    'Horas Extras Nocturnas',
    'Horas Extras Diurnas Festivas',
    'Horas Extras Nocturnas Festivas',
  ];

  const sHeader: CellStyle = {
    font: { bold: true, sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.orange }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDERS,
  };

  HEADERS.forEach((h, ci) => {
    ws[cellAddr(4, ci)] = { t: 's', v: h, s: sHeader };  // fila index 4 = Excel fila 5
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 4 — Filas de datos (Excel 6..DATA_LAST)
  // Columna G: SIEMPRE fórmula =SUM(Hn:Kn), nunca valor directo
  // ─────────────────────────────────────────────────────────────────────────

  const N = Math.max(entries.length, 17);
  const DATA_FIRST = 6;
  const DATA_LAST = 5 + N;      // última fila Excel con datos
  const TOT_ROW = DATA_LAST + 1;
  const OBS_ROW = TOT_ROW + 1;
  const LEY1_ROW = TOT_ROW + 2;
  const LEY2_ROW = TOT_ROW + 3;

  const sBase: CellStyle = {
    font: { sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.white }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDERS,
  };
  const sNum:   CellStyle = { ...sBase, numFmt: '0.00' };
  const sWrap:  CellStyle = { ...sBase, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } };
  const sFecha: CellStyle = { ...sBase, numFmt: 'm/d/yy' };
  const sHora:  CellStyle = { ...sBase, numFmt: 'h:mm:ss AM/PM' };

  for (let i = 0; i < N; i++) {
    const excelRow = DATA_FIRST + i;
    const ri = excelRow - 1;
    const e = entries[i];

    if (e) {
      // A: fecha como número de serie de Excel (ver parseFecha)
      ws[cellAddr(ri, 0)] = { t: 'n', v: parseFecha(e.fecha),       s: sFecha };
      // B: solicitadaPor
      ws[cellAddr(ri, 1)] = { t: 's', v: e.solicitadaPor,           s: sBase  };
      // C: actividad (texto largo, wrap)
      ws[cellAddr(ri, 2)] = { t: 's', v: e.actividad,               s: sWrap  };
      // D: observaciones (texto largo, wrap)
      ws[cellAddr(ri, 3)] = { t: 's', v: formatObservaciones(e.observaciones), s: sWrap  };
      // E: horaInicio como fracción de día (número puro)
      ws[cellAddr(ri, 4)] = { t: 'n', v: parseHora(e.horaInicio),   s: sHora  };
      // F: horaFinal como fracción de día
      ws[cellAddr(ri, 5)] = { t: 'n', v: parseHora(e.horaFinal),    s: sHora  };
      // H–K: horas extras
      ws[cellAddr(ri, 7)] = { t: 'n', v: e.extrasDiurnas,            s: sNum   };
      ws[cellAddr(ri, 8)] = { t: 'n', v: e.extrasNocturnas,          s: sNum   };
      ws[cellAddr(ri, 9)] = { t: 'n', v: e.extrasDiurnasFestivas,    s: sNum   };
      ws[cellAddr(ri,10)] = { t: 'n', v: e.extrasNocturnasFestivas,  s: sNum   };
    } else {
      // Celdas vacías con formato y bordes aplicados
      ws[cellAddr(ri, 0)] = { t: 's', v: '', s: sBase  };
      ws[cellAddr(ri, 1)] = { t: 's', v: '', s: sBase  };
      ws[cellAddr(ri, 2)] = { t: 's', v: '', s: sWrap  };
      ws[cellAddr(ri, 3)] = { t: 's', v: '', s: sWrap  };
      ws[cellAddr(ri, 4)] = { t: 's', v: '', s: sBase  };
      ws[cellAddr(ri, 5)] = { t: 's', v: '', s: sBase  };
      ws[cellAddr(ri, 7)] = { t: 'n', v: 0,  s: sNum   };
      ws[cellAddr(ri, 8)] = { t: 'n', v: 0,  s: sNum   };
      ws[cellAddr(ri, 9)] = { t: 'n', v: 0,  s: sNum   };
      ws[cellAddr(ri,10)] = { t: 'n', v: 0,  s: sNum   };
    }

    // G: SIEMPRE fórmula =SUM(Hn:Kn), incluso en filas vacías
    ws[cellAddr(ri, 6)] = {
      t: 'n', v: 0,
      f: `SUM(H${excelRow}:K${excelRow})`,
      s: sNum,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 5 — Fila de totales (Excel TOT_ROW)
  // F(TOT_ROW) = "TOTAL HORAS" · G:K = fórmulas SUM
  // ─────────────────────────────────────────────────────────────────────────

  const TOT_RI = TOT_ROW - 1;

  const sTotalBase: CellStyle = {
    font: { bold: true, sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.white }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDERS,
  };
  const sTotalNum: CellStyle = { ...sTotalBase, numFmt: '0.00' };

  // A23–E23: vacías con estilo bold
  for (let c = 0; c < 5; c++) {
    ws[cellAddr(TOT_RI, c)] = { t: 's', v: '', s: sTotalBase };
  }
  // F23: etiqueta
  ws[cellAddr(TOT_RI, 5)] = { t: 's', v: 'TOTAL HORAS', s: sTotalBase };

  // G23:K23: fórmulas SUM sobre el rango completo de datos
  ['G', 'H', 'I', 'J', 'K'].forEach((letter, idx) => {
    ws[cellAddr(TOT_RI, 6 + idx)] = {
      t: 'n', v: 0,
      f: `SUM(${letter}${DATA_FIRST}:${letter}${DATA_LAST})`,
      s: sTotalNum,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 6 — Leyenda (filas OBS_ROW..LEY2_ROW)
  // Solo columnas A y B llevan estilo en leyenda.
  // ─────────────────────────────────────────────────────────────────────────

  const sLeyHeader: CellStyle = {
    font: { bold: true, italic: true, sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.green }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDERS,
  };
  const sLeyLine: CellStyle = {
    font: { bold: true, italic: true, sz: 11, name: 'Calibri' },
    fill: { fgColor: { rgb: CLR.green }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDERS,
  };

  ws[`A${OBS_ROW}`] = { t: 's', v: 'OBSERVACIONES', s: sLeyHeader };

  ws[`A${LEY1_ROW}`] = { t: 's', v: 'Hora Extra Diurna', s: sLeyLine };
  ws[`B${LEY1_ROW}`] = { t: 's', v: 'Aplica de 6:00 am a 7:00 pm', s: sLeyLine };

  ws[`A${LEY2_ROW}`] = { t: 's', v: 'Hora Extra Nocturna', s: sLeyLine };
  ws[`B${LEY2_ROW}`] = { t: 's', v: 'Aplica de 7:00 pm a 6:00 am', s: sLeyLine };

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 7 — Merges
  // ─────────────────────────────────────────────────────────────────────────

  ws['!merges'] = [
    { s: { r: 0,  c: 2  }, e: { r: 0,  c: 7  } },  // C1:H1  — título
  ];

  // Re-aplica estilo a la celda ancla del título (puede perderse al serializar el merge)
  setStyle(ws, 'C1', tituloStyle);

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 8 — Anchos de columna
  // ─────────────────────────────────────────────────────────────────────────

  ws['!cols'] = [
    { wch: 14 }, // A Fecha
    { wch: 20 }, // B Solicitada por
    { wch: 35 }, // C Actividad
    { wch: 30 }, // D Observaciones
    { wch: 12 }, // E Hora inicio
    { wch: 12 }, // F Hora final
    { wch: 12 }, // G Total Horas
    { wch: 22 }, // H Extras Diurnas
    { wch: 24 }, // I Extras Nocturnas
    { wch: 28 }, // J Extras Diurnas Festivas
    { wch: 30 }, // K Extras Nocturnas Festivas
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Sección 9 — Altos de fila
  // ─────────────────────────────────────────────────────────────────────────

  ws['!rows'] = Array.from({ length: LEY2_ROW }, () => ({}));
  ws['!rows'][0] = { hpt: 24 };  // fila 1: título
  ws['!rows'][4] = { hpt: 32 };  // fila 5: encabezados con wrapText

  // ── Rango de la hoja ──────────────────────────────────────────────────────

  ws['!ref'] = `A1:K${LEY2_ROW}`;

  // ── Libro y exportación ───────────────────────────────────────────────────

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buffer as ArrayBuffer);
}

/*
 * ── Integración con Tauri ────────────────────────────────────────────────────
 *
 * import { save }      from '@tauri-apps/plugin-dialog';
 * import { writeFile } from '@tauri-apps/plugin-fs';
 *
 * const bytes = await generateOvertimeXlsx(entries, meta, 'Enero 2026');
 * const path  = await save({
 *   defaultPath: `horas-extras-enero-2026.xlsx`,
 *   filters: [{ name: 'Excel', extensions: ['xlsx'] }],
 * });
 * if (path) await writeFile(path, bytes);
 */
