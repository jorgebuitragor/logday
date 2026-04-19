import { OvertimeEntry, OvertimeMonthMeta } from '../types';

export async function generateOvertimeXlsx(
  entries: OvertimeEntry[],
  meta: OvertimeMonthMeta,
  mesLabel: string,
): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const HEADERS = [
    'Fecha',
    'Solicitada por',
    'Actividad Realizada',
    'Observaciones',
    'Hora inicio',
    'Hora final',
    'Total Horas',
    'Horas Extras Diurnas',
    'Horas Extras Nocturnas',
    'Horas Extras Diurnas Festivas',
    'Horas Extras Nocturnas Festivas',
  ];

  // Preparar filas de datos (máx 17 filas, rellenar con vacíos)
  const dataRows: (string | number)[][] = [];
  for (let i = 0; i < 17; i++) {
    const e = entries[i];
    if (e) {
      dataRows.push([
        e.fecha,
        e.solicitadaPor,
        e.actividad,
        e.observaciones,
        e.horaInicio,
        e.horaFinal,
        e.totalHoras,
        e.extrasDiurnas,
        e.extrasNocturnas,
        e.extrasDiurnasFestivas,
        e.extrasNocturnasFestivas,
      ]);
    } else {
      dataRows.push(['', '', '', '', '', '', '', '', '', '', '']);
    }
  }

  // Calcular totales
  const sum = (fn: (e: OvertimeEntry) => number) =>
    entries.reduce((acc, e) => acc + fn(e), 0);

  const totalesRow = [
    'TOTAL HORAS',
    '',
    '',
    '',
    '',
    '',
    Math.round(sum(e => e.totalHoras) * 100) / 100,
    Math.round(sum(e => e.extrasDiurnas) * 100) / 100,
    Math.round(sum(e => e.extrasNocturnas) * 100) / 100,
    Math.round(sum(e => e.extrasDiurnasFestivas) * 100) / 100,
    Math.round(sum(e => e.extrasNocturnasFestivas) * 100) / 100,
  ];

  const aoa: (string | number)[][] = [
    [`HORAS EXTRAS - ${mesLabel}`, '', '', '', '', '', '', '', '', '', ''], // fila 1
    ['', '', '', '', '', '', '', '', '', '', ''],                           // fila 2
    [`NOMBRE COLABORADOR: ${meta.colaborador}`, '', '', '', '', '', '', '', '', '', ''], // fila 3
    [`CÉDULA: ${meta.cedula}`, '', '', '', '', '', '', '', '', '', ''],     // fila 4
    HEADERS,                                                               // fila 5
    ...dataRows,                                                           // filas 6-22
    totalesRow,                                                            // fila 23
    ['OBSERVACIONES', '', '', '', '', '', '', '', '', '', ''],             // fila 24
    ['Hora Extra Diurna — Aplica de 6:00 am a 7:00 pm', '', '', '', '', '', '', '', '', '', ''], // fila 25
    ['Hora Extra Nocturna — Aplica de 7:00 pm a 6:00 am', '', '', '', '', '', '', '', '', '', ''], // fila 26
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Ajustar anchos de columna
  ws['!cols'] = [
    { wch: 14 }, // Fecha
    { wch: 20 }, // Solicitada por
    { wch: 35 }, // Actividad
    { wch: 18 }, // Observaciones
    { wch: 12 }, // Hora inicio
    { wch: 12 }, // Hora final
    { wch: 12 }, // Total Horas
    { wch: 22 }, // Extras Diurnas
    { wch: 24 }, // Extras Nocturnas
    { wch: 28 }, // Extras Diurnas Festivas
    { wch: 30 }, // Extras Nocturnas Festivas
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horas Extras');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(buffer as ArrayBuffer);
}
