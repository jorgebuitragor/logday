// Lógica pura de las secciones del menú lateral (specs/navegacion-secciones):
// el orden y la visibilidad que eligió el usuario, los atajos, lo que cabe
// y lo que va a "Más". Sin React ni store, para probarla sola.

/** Cómo se dibujan las secciones (NS1). */
export type SidebarStyle = 'icons' | 'list';

/** Una sección en el orden guardado (`AppConfig.sidebarSections`). */
export interface SavedSection {
  id: string;
  hidden?: boolean;
}

/** Una sección disponible, ya en el orden del usuario. */
export interface ResolvedSection {
  id: string;
  hidden: boolean;
}

export const DEFAULT_SIDEBAR_STYLE: SidebarStyle = 'icons';

/** Las secciones fijas, salvo Inicio, en su orden por defecto (NS7). */
export const CORE_SECTION_IDS = ['dailys', 'tasks', 'notes', 'overtime'] as const;

/** La columna de la Barra de íconos (NS2). */
export const ICON_COLUMN_PX = 44;
/** Ancho mínimo del menú: con la Barra de íconos, el panel conserva los
 *  160 px de antes (design, Ancho). */
const MIN_WIDTH: Record<SidebarStyle, number> = { list: 160, icons: 160 + ICON_COLUMN_PX };
export const MAX_SIDEBAR_WIDTH = 420;

export function sidebarMinWidth(style: SidebarStyle): number {
  return MIN_WIDTH[style];
}

/** Un ancho guardado más chico que el mínimo del estilo se sube al leerlo
 *  (sin reescribirlo: si se vuelve a la Lista, se recupera). */
export function clampSidebarWidth(width: number, style: SidebarStyle): number {
  const w = Number.isFinite(width) ? width : MIN_WIDTH[style];
  return Math.max(MIN_WIDTH[style], Math.min(MAX_SIDEBAR_WIDTH, w));
}

// ── Config ────────────────────────────────────────────────────

/** NS5: sin estilo guardado (también si viene `sidebarLabelsVisible`, de
 *  antes de este cambio), la Barra de íconos. */
export function parseSidebarStyle(raw: unknown): SidebarStyle {
  return raw === 'list' || raw === 'icons' ? raw : DEFAULT_SIDEBAR_STYLE;
}

/** Lo que viene de `config.json`. Sin lista válida, `undefined` (el orden
 *  por defecto). Se descartan las entradas mal formadas y los repetidos. */
export function parseSidebarSections(raw: unknown): SavedSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: SavedSection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, hidden } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id === 'dashboard' || seen.has(id)) continue;
    seen.add(id);
    out.push(hidden === true ? { id, hidden: true } : { id });
  }
  return out;
}

// ── Orden y visibilidad ───────────────────────────────────────

/** NS7: el orden efectivo de las secciones disponibles (las 4 fijas y las
 *  extensiones activas con vista, en su orden por defecto). Las guardadas
 *  que no están disponibles no se muestran; las disponibles que no estaban
 *  se agregan al final, visibles. */
export function resolveSections(saved: readonly SavedSection[] | undefined, available: readonly string[]): ResolvedSection[] {
  const avail = new Set(available);
  const out: ResolvedSection[] = [];
  const placed = new Set<string>();
  for (const s of saved ?? []) {
    if (!avail.has(s.id) || placed.has(s.id)) continue;
    placed.add(s.id);
    out.push({ id: s.id, hidden: s.hidden === true });
  }
  for (const id of available) {
    if (!placed.has(id)) out.push({ id, hidden: false });
  }
  return out;
}

/** La lista que se guarda: la guardada completa (con las extensiones
 *  desactivadas en su lugar, por si vuelven) y, al final, las disponibles
 *  que no estaban. */
export function mergeSections(saved: readonly SavedSection[] | undefined, available: readonly string[]): SavedSection[] {
  const out: SavedSection[] = [];
  const placed = new Set<string>();
  for (const s of saved ?? []) {
    if (placed.has(s.id)) continue;
    placed.add(s.id);
    out.push(s.hidden ? { id: s.id, hidden: true } : { id: s.id });
  }
  for (const id of available) {
    if (!placed.has(id)) out.push({ id });
  }
  return out;
}

/** Sube (`delta` -1) o baja (+1) una sección un lugar entre las
 *  disponibles. Con `among`, solo cuenta como vecina una de esas (el clic
 *  derecho del menú mueve entre las que se ven). Las no disponibles no se
 *  mueven de su lugar. Si no se puede, devuelve la misma lista. */
export function moveSection(
  saved: readonly SavedSection[] | undefined,
  available: readonly string[],
  id: string,
  delta: -1 | 1,
  among?: readonly string[],
): SavedSection[] {
  const full = mergeSections(saved, available);
  const scope = new Set(among ?? available);
  const avail = new Set(available);
  const from = full.findIndex((s) => s.id === id);
  if (from < 0 || !avail.has(id)) return full;
  let to = from + delta;
  while (to >= 0 && to < full.length && !(avail.has(full[to].id) && scope.has(full[to].id))) to += delta;
  if (to < 0 || to >= full.length) return full;
  const next = [...full];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Lleva una sección a la posición `toIndex` del orden efectivo (al soltar
 *  después de arrastrar en Opciones). */
export function moveSectionTo(
  saved: readonly SavedSection[] | undefined,
  available: readonly string[],
  id: string,
  toIndex: number,
): SavedSection[] {
  const resolved = resolveSections(saved, available).map((s) => s.id);
  const from = resolved.indexOf(id);
  if (from < 0) return mergeSections(saved, available);
  const target = Math.max(0, Math.min(resolved.length - 1, toIndex));
  let next = mergeSections(saved, available);
  const step = target > from ? 1 : -1;
  for (let i = from; i !== target; i += step) next = moveSection(next, available, id, step);
  return next;
}

/** Oculta en "Más" o vuelve a mostrar una sección (NS9, NS11). */
export function setSectionHidden(
  saved: readonly SavedSection[] | undefined,
  available: readonly string[],
  id: string,
  hidden: boolean,
): SavedSection[] {
  return mergeSections(saved, available).map((s) =>
    s.id !== id ? s : hidden ? { id, hidden: true } : { id },
  );
}

// ── Atajos ────────────────────────────────────────────────────

/** NS15: el orden de los atajos ⌘1…⌘9 es el de lectura del menú: primero
 *  las visibles (también las que no caben y van a "Más") y después las
 *  ocultas, que siguen a un atajo (NS11). */
export function shortcutOrder(sections: readonly ResolvedSection[]): string[] {
  return [...sections.filter((s) => !s.hidden), ...sections.filter((s) => s.hidden)].map((s) => s.id);
}

/** El dígito del atajo de la sección en la posición `index` (desde 0) de
 *  `shortcutOrder`, o `undefined` desde la décima. */
export function shortcutFor(index: number): string | undefined {
  return index >= 0 && index < 9 ? String(index + 1) : undefined;
}

/** La sección del atajo ⌘<digit>: 0 es Inicio. */
export function sectionForDigit(digit: string, order: readonly string[]): string | undefined {
  if (!/^[0-9]$/.test(digit)) return undefined;
  if (digit === '0') return 'dashboard';
  return order[Number(digit) - 1];
}

/** La sección de un `keydown` con ⌘ (Ctrl en Windows y Linux) y un dígito,
 *  sin Alt ni Mayúsculas (⌘⌥1 es de los títulos del editor). */
export function sectionForShortcut(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  order: readonly string[],
): string | undefined {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return undefined;
  return sectionForDigit(e.key, order);
}

/** "⌘2" en macOS y "Ctrl+2" en Windows y Linux. */
export function shortcutLabel(digit: string | undefined, isMac: boolean): string {
  if (!digit) return '';
  return isMac ? `⌘${digit}` : `Ctrl+${digit}`;
}

// ── Lo que cabe ───────────────────────────────────────────────

/** NS12: si no caben todas, se muestran las primeras y "Más" ocupa el
 *  último lugar. `capacity` cuenta los lugares para secciones y "Más". */
export function splitForCapacity<T>(items: readonly T[], capacity: number): { shown: T[]; overflow: T[] } {
  if (items.length <= capacity) return { shown: [...items], overflow: [] };
  const keep = Math.max(0, Math.floor(capacity) - 1);
  return { shown: items.slice(0, keep), overflow: items.slice(keep) };
}

/** NS12: lo que se ve en el menú y lo que va a "Más": las que no caben
 *  (en su orden) y, después, las ocultas. Con alguna oculta, "Más" siempre
 *  está y ocupa uno de los lugares. */
export function splitSections<T extends { hidden: boolean }>(items: readonly T[], capacity: number): { shown: T[]; more: T[] } {
  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);
  if (hidden.length === 0) {
    const { shown, overflow } = splitForCapacity(visible, capacity);
    return { shown, more: overflow };
  }
  const keep = Math.max(0, Math.min(visible.length, Math.floor(capacity) - 1));
  return { shown: visible.slice(0, keep), more: [...visible.slice(keep), ...hidden] };
}

/** Los botones de la columna: 36 px y 4 px entre uno y otro. */
export const ICON_ITEM_PX = 36;
export const ICON_GAP_PX = 4;
/** La separadora entre las fijas y las extensiones (1 px y 4 px de margen
 *  a cada lado), más su hueco con el botón siguiente. */
export const SEPARATOR_PX = 9 + ICON_GAP_PX;

/** Cuántos botones caben en `heightPx` de la columna. */
export function iconCapacity(heightPx: number, separator: boolean): number {
  const h = heightPx - (separator ? SEPARATOR_PX : 0);
  return Math.max(0, Math.floor((h + ICON_GAP_PX) / (ICON_ITEM_PX + ICON_GAP_PX)));
}

/** Las filas de la Lista: 28 px y 2 px entre filas, y 8 px arriba y abajo. */
export const LIST_ROW_PX = 28;
const LIST_GAP_PX = 2;
const LIST_PADDING_PX = 16;
/** NS12: la Lista ocupa como máximo el 40 % del alto del menú. */
export const LIST_MAX_FRACTION = 0.4;

/** Cuántas filas de secciones (y "Más") caben en la Lista, sin contar la
 *  de Inicio, con el menú de `menuHeightPx` de alto. */
export function listCapacity(menuHeightPx: number, separator: boolean): number {
  const h = menuHeightPx * LIST_MAX_FRACTION - LIST_PADDING_PX - (separator ? 10 : 0);
  const rows = Math.floor((h + LIST_GAP_PX) / (LIST_ROW_PX + LIST_GAP_PX));
  return Math.max(0, rows - 1);
}

/** La separadora entre las fijas y las extensiones va antes del índice que
 *  devuelve, o -1 si no va: solo si hay de las dos y no están mezcladas. */
export function separatorIndex(isExtension: readonly boolean[]): number {
  const first = isExtension.indexOf(true);
  if (first <= 0) return -1;
  return isExtension.slice(first).every(Boolean) ? first : -1;
}

// ── Teclado ───────────────────────────────────────────────────

/** NS14: el siguiente índice del roving tabindex, o `null` si la tecla no
 *  mueve el foco. No da la vuelta en los bordes. */
export function nextRovingIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(count - 1, current + 1);
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// ── Buscar ────────────────────────────────────────────────────

/** Minúsculas y sin acentos, para comparar nombres (NS19). */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** NS19: si el nombre de la sección contiene lo escrito. */
export function matchesSectionQuery(label: string, query: string): boolean {
  const q = normalizeForMatch(query);
  return q.length > 0 && normalizeForMatch(label).includes(q);
}
