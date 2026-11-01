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

/** "Viernes 31 de Octubre" (como el mensaje de siempre) o "Friday, October 31". */
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
  /** El momento actual, para `hoy.es_hoy` y `hoy.dia` (en las pruebas). */
  now?: Date;
}

// En inglés va al principio de la línea ("Today, Monday, November 2:"),
// como el mensaje de siempre de Web en inglés.
const TODAY_PREFIX = { es: 'de hoy, ', en: 'Today, ' };

export function dailyTemplateContext(input: DailyContextInput): TemplateContext {
  const { language } = input;
  const isToday = sameDay(input.todayDate, input.now ?? new Date());
  const todayLabel = dailyDateLabel(input.todayDate, language);
  return {
    'anterior.fecha': dailyDateLabel(input.prevDate, language),
    'anterior.actividades': input.prevActivities.trim() || EMPTY[language].prev,
    'hoy.fecha': todayLabel,
    // "de hoy, Lunes 2 de Noviembre" si el Daily es de hoy: así "El día
    // {{hoy.dia}}:" da el mensaje de siempre sin secciones, que un usuario
    // que no programa no entendería.
    'hoy.dia': isToday ? `${TODAY_PREFIX[language]}${todayLabel}` : todayLabel,
    'hoy.actividades': input.todayActivities.trim() || EMPTY[language].today,
    'hoy.es_hoy': isToday,
    'usuario.nombre': input.userName ?? '',
  };
}

/** Los marcadores que se ofrecen para insertar, en orden. Las secciones
 *  (`{{#hoy.es_hoy}}`) siguen funcionando, pero no se ofrecen. */
export const DAILY_TEMPLATE_MARKERS = [
  'anterior.fecha',
  'anterior.actividades',
  'hoy.dia',
  'hoy.fecha',
  'hoy.actividades',
  'usuario.nombre',
] as const;

export type DailyTemplateMarker = (typeof DAILY_TEMPLATE_MARKERS)[number];

// ── La plantilla de Logday ────────────────────────────────────────────────

/** El mensaje de siempre escrito como plantilla: punto de partida para una
 *  propia. Da lo mismo que `buildDailyCopyText`, que es lo que se sigue
 *  usando cuando está elegida la de Logday. */
export const LOGDAY_DAILY_TEMPLATE = [
  'Buenos días.',
  '',
  'El día {{anterior.fecha}}:',
  '{{anterior.actividades}}',
  '',
  'El día {{hoy.dia}}:',
  '{{hoy.actividades}}',
].join('\n');

/** El mismo mensaje en inglés, como lo arma Web con la app en inglés. */
export const LOGDAY_DAILY_TEMPLATE_EN = [
  'Good morning.',
  '',
  '{{anterior.fecha}}:',
  '{{anterior.actividades}}',
  '',
  '{{hoy.dia}}:',
  '{{hoy.actividades}}',
].join('\n');

// ── Ejemplos para empezar ─────────────────────────────────────────────────
// Los nombres van en los textos de cada app (`templates.example*`). Aquí
// solo el texto, porque i18next (Mobile) interpretaría las llaves.

export const DAILY_TEMPLATE_EXAMPLES: Record<DailyTemplateLanguage, { id: 'usual' | 'short' | 'named'; template: string }[]> = {
  es: [
    { id: 'usual', template: LOGDAY_DAILY_TEMPLATE },
    {
      id: 'short',
      template: ['{{anterior.fecha}}:', '{{anterior.actividades}}', '', '{{hoy.fecha}}:', '{{hoy.actividades}}'].join('\n'),
    },
    {
      id: 'named',
      template: [
        'Daily de {{usuario.nombre}}',
        '',
        'Lo que hice ({{anterior.fecha}}):',
        '{{anterior.actividades}}',
        '',
        'Lo que haré ({{hoy.fecha}}):',
        '{{hoy.actividades}}',
      ].join('\n'),
    },
  ],
  en: [
    { id: 'usual', template: LOGDAY_DAILY_TEMPLATE_EN },
    {
      id: 'short',
      template: ['{{anterior.fecha}}:', '{{anterior.actividades}}', '', '{{hoy.fecha}}:', '{{hoy.actividades}}'].join('\n'),
    },
    {
      id: 'named',
      template: [
        "{{usuario.nombre}}'s daily",
        '',
        'What I did ({{anterior.fecha}}):',
        '{{anterior.actividades}}',
        '',
        "What I'll do ({{hoy.fecha}}):",
        '{{hoy.actividades}}',
      ].join('\n'),
    },
  ],
};

/** Parte una plantilla en texto y marcadores, para dibujar los marcadores
 *  como recuadros. Las secciones (`{{#x}}`, `{{/x}}`) quedan como texto. */
export function splitTemplate(template: string): ({ kind: 'text'; text: string } | { kind: 'marker'; name: string })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'marker'; name: string })[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: template.slice(last, at) });
    out.push({ kind: 'marker', name: m[1] });
    last = at + m[0].length;
  }
  if (last < template.length) out.push({ kind: 'text', text: template.slice(last) });
  return out;
}
