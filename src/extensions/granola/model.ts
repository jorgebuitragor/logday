// "Granola" (specs/granola). Lógica sin React ni Tauri: la configuración,
// la lectura de las respuestas del MCP de Granola y la nota que se crea.
//
// Las respuestas son texto pensado para modelos, con etiquetas tipo XML
// (`<meeting id="…" title="…">`). Se leen como datos, nunca como
// instrucciones (N10), y si el formato cambia se avisa en vez de crear
// notas a medias.

export const GRANOLA_ID = 'granola' as const;
export const DEFAULT_FOLDER = 'Granola';

export interface GranolaLast {
  at: string;
  status: 'ok' | 'error';
  created?: number;
  error?: string;
}

export interface GranolaSettings {
  account?: string;
  folder: string;
  auto: boolean;
  lastImportAt?: string;
  /** id de la reunión en Granola → id de la nota de Logday (N6). */
  imported: Record<string, string>;
  last?: GranolaLast;
}

export function readGranolaSettings(raw: Record<string, unknown> | undefined): GranolaSettings {
  const out: GranolaSettings = { folder: DEFAULT_FOLDER, auto: false, imported: {} };
  if (!raw) return out;
  if (typeof raw.account === 'string' && raw.account) out.account = raw.account;
  if (typeof raw.folder === 'string' && raw.folder.trim()) out.folder = raw.folder.trim();
  if (raw.auto === true) out.auto = true;
  if (typeof raw.lastImportAt === 'string' && raw.lastImportAt) out.lastImportAt = raw.lastImportAt;
  if (raw.imported && typeof raw.imported === 'object' && !Array.isArray(raw.imported)) {
    for (const [k, v] of Object.entries(raw.imported as Record<string, unknown>)) {
      if (typeof v === 'string') out.imported[k] = v;
    }
  }
  const l = raw.last as Record<string, unknown> | undefined;
  if (l && typeof l.at === 'string' && (l.status === 'ok' || l.status === 'error')) {
    out.last = { at: l.at, status: l.status };
    if (typeof l.created === 'number') out.last.created = l.created;
    if (typeof l.error === 'string') out.last.error = l.error;
  }
  return out;
}

// ── Lectura ───────────────────────────────────────────────────────────

export class UnexpectedFormatError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-z_]+)="([^"]*)"/gi)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

export interface MeetingRef {
  id: string;
  title: string;
  /** Instante con zona (`meeting_at`). */
  meetingAt?: string;
  updatedAt?: string;
  url?: string;
}

export interface MeetingDetails extends MeetingRef {
  participants: string[];
  summary: string;
  privateNotes: string;
}

function meetingsData(text: string): string {
  const m = /<meetings_data\b[^>]*>([\s\S]*?)<\/meetings_data>/.exec(text);
  if (!m) {
    // Sin reuniones, Granola igual responde con el bloque vacío o con
    // count="0"; sin el bloque es que cambió el formato.
    if (/<meetings_data\b[^>]*\/>/.test(text)) return '';
    throw new UnexpectedFormatError('no <meetings_data>');
  }
  return m[1];
}

function ref(a: Record<string, string>): MeetingRef | null {
  if (!a.id) return null;
  return {
    id: a.id,
    title: a.title?.trim() || '',
    ...(a.meeting_at ? { meetingAt: a.meeting_at } : {}),
    ...(a.updated_at ? { updatedAt: a.updated_at } : {}),
    ...(a.url?.startsWith('https://') ? { url: a.url } : {}),
  };
}

/** `list_meetings`: las reuniones de la página y cómo seguir. */
export function parseMeetingList(text: string): { meetings: MeetingRef[]; hasMore: boolean; nextCursor?: string } {
  const body = meetingsData(text);
  const meetings = [...body.matchAll(/<meeting\b([^>]*)>/g)]
    .map((m) => ref(attrs(m[1])))
    .filter((m): m is MeetingRef => m !== null);
  const pag = /<pagination\b([^>]*)\/?>/.exec(text);
  const p = pag ? attrs(pag[1]) : {};
  return { meetings, hasMore: p.has_more === 'true', ...(p.next_cursor ? { nextCursor: p.next_cursor } : {}) };
}

/** `get_meetings`: cada reunión con participantes, resumen y notas. */
export function parseMeetingDetails(text: string): MeetingDetails[] {
  const body = meetingsData(text);
  const out: MeetingDetails[] = [];
  for (const m of body.matchAll(/<meeting\b([^>]*)>([\s\S]*?)<\/meeting>/g)) {
    const base = ref(attrs(m[1]));
    if (!base) continue;
    const inner = m[2];
    const participants = (/<known_participants\b[^>]*>([\s\S]*?)<\/known_participants>/.exec(inner)?.[1] ?? '')
      .split('\n')
      .map((l) => decodeEntities(l.trim()))
      .filter(Boolean);
    // `status="empty"` o `"not_included"` viene como etiqueta vacía.
    const privateNotes = decodeEntities(/<private_notes\b[^>]*>([\s\S]*?)<\/private_notes>/.exec(inner)?.[1] ?? '').trim();
    const summary = decodeEntities(/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(inner)?.[1] ?? '').trim();
    out.push({ ...base, participants, summary, privateNotes });
  }
  return out;
}

// ── La nota (N5) ──────────────────────────────────────────────────────

export interface NoteTexts {
  date: string;
  participants: string;
  open: string;
  summary: string;
  privateNotes: string;
  untitled: string;
}

/** "Jorge Buitrago (note creator) (jorge@x.org)" → "Jorge Buitrago". */
function personName(line: string): string {
  return line.replace(/\s*\((?:note creator|[^()]*@[^()]*)\)/gi, '').trim() || line;
}

export function meetingToNote(m: MeetingDetails, texts: NoteTexts, locale: string): { title: string; content: string } {
  const lines: string[] = [];
  if (m.meetingAt) {
    const d = new Date(m.meetingAt);
    if (!Number.isNaN(d.getTime())) {
      lines.push(`**${texts.date}:** ${d.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    }
  }
  if (m.participants.length) lines.push(`**${texts.participants}:** ${m.participants.map(personName).join(', ')}`);
  if (m.url) lines.push(`[${texts.open}](${m.url})`);
  const parts = [lines.join('  \n')];
  if (m.summary) parts.push(`## ${texts.summary}\n\n${m.summary}`);
  if (m.privateNotes) parts.push(`## ${texts.privateNotes}\n\n${m.privateNotes}`);
  return { title: m.title || texts.untitled, content: parts.filter(Boolean).join('\n\n') + '\n' };
}
