import { getColombianHolidays } from './colombianHolidays';

function isFestiveDay(fecha: string): boolean {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 0) return true; // domingo
  const holidays = getColombianHolidays(year);
  return holidays.has(fecha);
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function calcOvertimeBreakdown(
  fecha: string,
  horaInicio: string,
  horaFinal: string,
): {
  totalHoras: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasFestivas: number;
  extrasNocturnasFestivas: number;
} {
  const startMin = timeToMinutes(horaInicio);
  let endMin = timeToMinutes(horaFinal);
  if (endMin <= startMin) endMin += 24 * 60; // cruce de medianoche

  const festive = isFestiveDay(fecha);
  // Si cruza medianoche, el día siguiente
  const [year, month, day] = fecha.split('-').map(Number);
  const nextDate = new Date(year, month - 1, day + 1);
  const nextFecha = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  const nextFestive = isFestiveDay(nextFecha);

  let diurnas = 0;
  let nocturnas = 0;
  let diurnasFestivas = 0;
  let nocturnasFestivas = 0;

  // Iterar minuto a minuto
  for (let m = startMin; m < endMin; m++) {
    const minuteInDay = m % (24 * 60);
    // Diurno: 06:00 a 19:00 (minuto 360 a 1139)
    const isDiurno = minuteInDay >= 360 && minuteInDay < 1140;
    const currentFestive = m < 24 * 60 ? festive : nextFestive;

    if (isDiurno) {
      if (currentFestive) diurnasFestivas++;
      else diurnas++;
    } else {
      if (currentFestive) nocturnasFestivas++;
      else nocturnas++;
    }
  }

  const totalMinutes = endMin - startMin;
  const toHours = (mins: number) => Math.round((mins / 60) * 100) / 100;

  return {
    totalHoras: toHours(totalMinutes),
    extrasDiurnas: toHours(diurnas),
    extrasNocturnas: toHours(nocturnas),
    extrasDiurnasFestivas: toHours(diurnasFestivas),
    extrasNocturnasFestivas: toHours(nocturnasFestivas),
  };
}
