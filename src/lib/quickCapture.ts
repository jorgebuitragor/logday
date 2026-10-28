import { addDaysISO } from './localDate';

// Captura rápida de tareas: "Llamar al proveedor #logday @infra mañana".
//
// - `#proyecto` asigna el proyecto si existe (sin distinguir mayúsculas);
//   si no existe, queda en el título tal cual.
// - `@tag` agrega un tag.
// - La fecha se reconoce solo al final del texto ("hoy", "mañana",
//   "pasado mañana", un día de la semana) o en cualquier lugar si es
//   explícita (`15/11`, `2026-11-15`). Una palabra como "mañana" en medio
//   del título ("Preparar la reunión de mañana con Ana") no se toma como
//   fecha: quitarla del título sorprendería más de lo que ayuda.

export interface QuickCaptureResult {
  title: string;
  project?: string;
  tags: string[];
  due?: string;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// Palabras que quedan colgando al quitar la fecha: "Llamar el viernes"
// queda "Llamar", no "Llamar el".
const CONNECTORS = new Set(['el', 'la', 'de', 'del', 'para', 'este', 'esta', 'on', 'by', 'for', 'this']);

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Fecha explícita (`2026-11-15`, `15/11`, `15/11/2026`) o null. Sin año,
 *  la próxima vez que caiga esa fecha a partir de hoy. */
function explicitDate(token: string, today: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(token);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  const iso = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!m[3] && iso(year) < today) year += 1;
  // Descarta fechas imposibles como 31/02.
  const candidate = iso(year);
  return addDaysISO(candidate, 0) === candidate ? candidate : null;
}

/** Fecha relativa escrita al final ("hoy", "mañana", "viernes"...) o null. */
function relativeDate(word: string, today: string): string | null {
  const w = normalize(word);
  if (w === 'hoy' || w === 'today') return today;
  if (w === 'manana' || w === 'tomorrow') return addDaysISO(today, 1);
  if (w in WEEKDAYS) {
    const [y, m, d] = today.split('-').map(Number);
    const current = new Date(y, m - 1, d, 12).getDay();
    // El próximo: si hoy es viernes, "viernes" es el de la semana que viene.
    const ahead = ((WEEKDAYS[w] - current + 7) % 7) || 7;
    return addDaysISO(today, ahead);
  }
  return null;
}

export function parseQuickCapture(input: string, projects: string[], today: string): QuickCaptureResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const tags: string[] = [];
  let project: string | undefined;
  let due: string | undefined;

  for (const token of tokens) {
    if (token.length > 1 && token.startsWith('#')) {
      const match = projects.find((p) => p.toLowerCase() === token.slice(1).toLowerCase());
      if (match) { project = match; continue; }
    }
    if (token.length > 1 && token.startsWith('@')) {
      const tag = token.slice(1);
      if (!tags.includes(tag)) tags.push(tag);
      continue;
    }
    const explicit = explicitDate(token, today);
    if (explicit) { due = explicit; continue; }
    kept.push(token);
  }

  // Fecha relativa: solo las últimas palabras del título.
  if (!due && kept.length > 1) {
    const last2 = kept.slice(-2).map(normalize).join(' ');
    if (last2 === 'pasado manana') {
      due = addDaysISO(today, 2);
      kept.splice(-2);
    } else {
      const rel = relativeDate(kept[kept.length - 1], today);
      if (rel) { due = rel; kept.pop(); }
    }
    while (due && kept.length > 1 && CONNECTORS.has(normalize(kept[kept.length - 1]))) kept.pop();
  }

  return { title: kept.join(' '), project, tags, due };
}
