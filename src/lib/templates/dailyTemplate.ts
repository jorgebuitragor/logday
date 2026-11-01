// Plantilla del mensaje del Daily (logday-server specs/plantillas, design
// §2). Un subconjunto de Mustache escrito a mano, sin dependencias ni
// imports de la app: el mismo archivo va en Desktop, Web y Mobile.
//
// - `{{nombre}}`: un valor. Los nombres con punto son rutas (`hoy.fecha`).
// - `{{#nombre}}…{{/nombre}}`: se muestra si el valor es verdadero;
//   `{{^nombre}}…{{/nombre}}`, si es falso. Sin listas ni parciales.
// - Un nombre desconocido da texto vacío y se reporta en `unknown`. Si las
//   secciones no cierran, el texto sale tal cual y se reporta en `error`.

export type DailyTemplateLanguage = 'es' | 'en';

export type TemplateValue = string | boolean;
export type TemplateContext = Record<string, TemplateValue>;

export interface RenderResult {
  text: string;
  /** Marcadores que no existen en el contexto, sin repetir. */
  unknown: string[];
  /** Sección sin cerrar o cerrada de más (el texto sale sin interpretar). */
  error: string | null;
}

const TAG = /\{\{\s*([#^/]?)\s*([\w.]+)\s*\}\}/g;

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'var'; name: string }
  | { kind: 'section'; name: string; inverted: boolean; children: Node[] };

function parse(template: string): Node[] | string {
  const root: Node[] = [];
  const stack: { name: string; inverted: boolean; children: Node[] }[] = [];
  let current = root;
  let last = 0;
  for (const m of template.matchAll(TAG)) {
    const [raw, sigil, name] = m;
    const at = m.index ?? 0;
    if (at > last) current.push({ kind: 'text', text: template.slice(last, at) });
    last = at + raw.length;
    if (sigil === '#' || sigil === '^') {
      const section = { kind: 'section' as const, name, inverted: sigil === '^', children: [] as Node[] };
      current.push(section);
      stack.push(section);
      current = section.children;
    } else if (sigil === '/') {
      const open = stack.pop();
      if (!open || open.name !== name) return `{{/${name}}} no cierra ninguna sección abierta`;
      current = stack.length ? stack[stack.length - 1].children : root;
    } else {
      current.push({ kind: 'var', name });
    }
  }
  if (stack.length) return `falta {{/${stack[stack.length - 1].name}}}`;
  if (last < template.length) current.push({ kind: 'text', text: template.slice(last) });
  return root;
}

export function renderTemplate(template: string, context: TemplateContext): RenderResult {
  const tree = parse(template);
  if (typeof tree === 'string') return { text: template, unknown: [], error: tree };
  const unknown = new Set<string>();
  const walk = (nodes: Node[]): string =>
    nodes
      .map((node) => {
        if (node.kind === 'text') return node.text;
        if (!(node.name in context)) unknown.add(node.name);
        const value = context[node.name];
        if (node.kind === 'var') return typeof value === 'string' ? value : '';
        return Boolean(value) !== node.inverted ? walk(node.children) : '';
      })
      .join('');
  return { text: walk(tree), unknown: [...unknown], error: null };
}

// ── Contexto del Daily ────────────────────────────────────────────────────

const DAYS = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const EMPTY = {
  es: { prev: '- (sin actividades registradas)', today: '- (sin actividades aún)' },
  en: { prev: '- (no activities recorded)', today: '- (no activities yet)' },
};

/** "Viernes 31 de Octubre" (como la FCV) o "Friday, October 31". */
export function dailyDateLabel(d: Date, language: DailyTemplateLanguage): string {
  const day = DAYS[language][d.getDay()];
  const month = MONTHS[language][d.getMonth()];
  return language === 'en' ? `${day}, ${month} ${d.getDate()}` : `${day} ${d.getDate()} de ${month}`;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export interface DailyContextInput {
  prevDate: Date;
  prevActivities: string;
  todayDate: Date;
  todayActivities: string;
  language: DailyTemplateLanguage;
  /** El nombre del usuario, o vacío. */
  userName?: string;
  /** El momento actual, para `hoy.es_hoy` (en las pruebas). */
  now?: Date;
}

export function dailyTemplateContext(input: DailyContextInput): TemplateContext {
  const { language } = input;
  return {
    'anterior.fecha': dailyDateLabel(input.prevDate, language),
    'anterior.actividades': input.prevActivities.trim() || EMPTY[language].prev,
    'hoy.fecha': dailyDateLabel(input.todayDate, language),
    'hoy.actividades': input.todayActivities.trim() || EMPTY[language].today,
    'hoy.es_hoy': sameDay(input.todayDate, input.now ?? new Date()),
    'usuario.nombre': input.userName ?? '',
  };
}

/** Los marcadores, en el orden en que se ofrecen para insertar. */
export const DAILY_TEMPLATE_MARKERS = [
  'anterior.fecha',
  'anterior.actividades',
  'hoy.fecha',
  'hoy.actividades',
  'usuario.nombre',
] as const;

// ── La plantilla genérica de Logday (aprobada el 1 nov 2026) ──────────────

export const LOGDAY_DAILY_TEMPLATE: Record<DailyTemplateLanguage, string> = {
  es: [
    'Avance del día anterior ({{anterior.fecha}}):',
    '{{anterior.actividades}}',
    '',
    'Plan {{#hoy.es_hoy}}de hoy{{/hoy.es_hoy}}{{^hoy.es_hoy}}del día{{/hoy.es_hoy}} ({{hoy.fecha}}):',
    '{{hoy.actividades}}',
  ].join('\n'),
  en: [
    'Previous workday ({{anterior.fecha}}):',
    '{{anterior.actividades}}',
    '',
    '{{#hoy.es_hoy}}Today{{/hoy.es_hoy}}{{^hoy.es_hoy}}Plan{{/hoy.es_hoy}} ({{hoy.fecha}}):',
    '{{hoy.actividades}}',
  ].join('\n'),
};

/** La FCV escrita como plantilla: punto de partida para una propia. Da lo
 *  mismo que `buildDailyCopyText`, que es lo que se sigue usando para la FCV. */
export const FCV_DAILY_TEMPLATE = [
  'Buenos días.',
  '',
  'El día {{anterior.fecha}}:',
  '{{anterior.actividades}}',
  '',
  '{{#hoy.es_hoy}}El día de hoy, {{hoy.fecha}}:{{/hoy.es_hoy}}{{^hoy.es_hoy}}El día {{hoy.fecha}}:{{/hoy.es_hoy}}',
  '{{hoy.actividades}}',
].join('\n');
