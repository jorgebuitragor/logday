// El editor de una plantilla de texto (logday-server specs/plantillas, v1).
// Un usuario que no programa no entiende `{{anterior.fecha}}`: aquí cada
// marcador se ve como un recuadro de color con su nombre («Fecha del día
// anterior»), y por dentro se guarda como `{{clave}}`.
//
// Es un `<textarea>` normal (escribir, deshacer, pegar y el corrector
// funcionan como siempre) con el texto de los marcadores ya cambiado por
// «Nombre», y detrás una capa con el mismo texto y la misma tipografía que
// pinta un recuadro bajo cada «Nombre». Como las dos tienen el mismo texto,
// los recuadros quedan justo debajo. Borrar junto a un recuadro lo quita
// entero; si se escribe dentro de uno, deja de ser marcador y queda como
// texto (la vista previa avisa). Sin dependencias de la app: el mismo
// archivo va en Web.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { splitTemplate } from '../../lib/templates/dailyTemplate';

export type MarkerTone = 'amber' | 'indigo' | 'teal';

export interface MarkerDef {
  key: string;
  label: string;
  tone: MarkerTone;
}

export interface TemplateTextEditorHandle {
  /** Inserta un marcador donde está el cursor (o reemplaza la selección). */
  insert: (key: string) => void;
}

/** El fondo de cada tono: legible con el texto del tema, claro u oscuro. */
export const TONE_BG: Record<MarkerTone, string> = {
  amber: 'rgba(245, 158, 11, 0.24)',
  indigo: 'rgba(99, 102, 241, 0.26)',
  teal: 'rgba(20, 184, 166, 0.24)',
};

const OPEN = '«';
const CLOSE = '»';
const TOKEN = /«([^«»\n]+)»/g;

/** `{{clave}}` → «Nombre» (los marcadores que no conoce quedan tal cual). */
function toDisplay(template: string, byKey: Map<string, MarkerDef>): string {
  return splitTemplate(template)
    .map((part) => {
      if (part.kind === 'text') return part.text;
      const def = byKey.get(part.name);
      return def ? `${OPEN}${def.label}${CLOSE}` : `{{${part.name}}}`;
    })
    .join('');
}

/** «Nombre» → `{{clave}}`. Un «…» que no es el nombre de un marcador queda
 *  como texto. */
function fromDisplay(display: string, byLabel: Map<string, MarkerDef>): string {
  return display.replace(TOKEN, (m, label: string) => {
    const def = byLabel.get(label);
    return def ? `{{${def.key}}}` : m;
  });
}

/** El recuadro que contiene `pos` o termina/empieza justo ahí. */
function tokenAt(display: string, pos: number, byLabel: Map<string, MarkerDef>, side: 'before' | 'after'): [number, number] | null {
  for (const m of display.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!byLabel.has(m[1])) continue;
    if (side === 'before' && pos > start && pos <= end) return [start, end];
    if (side === 'after' && pos >= start && pos < end) return [start, end];
  }
  return null;
}

// Lo que comparten el textarea y la capa de atrás: si algo de esto cambia
// en uno y no en el otro, los recuadros se corren.
const SHARED = 'px-3 py-2 text-xs leading-[1.7] font-sans whitespace-pre-wrap break-words';

export const TemplateTextEditor = forwardRef<TemplateTextEditorHandle, {
  id: string;
  value: string;
  onChange: (template: string) => void;
  onBlur?: () => void;
  markers: MarkerDef[];
  rows?: number;
}>(function TemplateTextEditor({ id, value, onChange, onBlur, markers, rows = 8 }, ref) {
  const byKey = useMemo(() => new Map(markers.map((m) => [m.key, m])), [markers]);
  const byLabel = useMemo(() => new Map(markers.map((m) => [m.label, m])), [markers]);
  const [display, setDisplay] = useState(() => toDisplay(value, byKey));
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  // Cuando el texto no cabe, la barra de scroll le quita ancho al textarea
  // (unos 15 px con barras clásicas): la capa de atrás pierde lo mismo por
  // la derecha, o las líneas largas se parten distinto y los recuadros se
  // corren.
  const [scrollbar, setScrollbar] = useState(0);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setScrollbar(el.offsetWidth - el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [display]);

  // Si el valor cambia por fuera (un ejemplo, otro idioma), se redibuja.
  // Lo que viene de escribir aquí ya coincide y no mueve el cursor.
  useEffect(() => {
    if (fromDisplay(display, byLabel) !== value) setDisplay(toDisplay(value, byKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, byKey, byLabel]);

  const commit = (next: string, caret?: number) => {
    setDisplay(next);
    onChange(fromDisplay(next, byLabel));
    if (caret !== undefined) {
      requestAnimationFrame(() => {
        area.current?.focus();
        area.current?.setSelectionRange(caret, caret);
      });
    }
  };

  useImperativeHandle(ref, () => ({
    insert: (key) => {
      const def = byKey.get(key);
      if (!def) return;
      const el = area.current;
      const start = el ? el.selectionStart : display.length;
      const end = el ? el.selectionEnd : display.length;
      const token = `${OPEN}${def.label}${CLOSE}`;
      commit(display.slice(0, start) + token + display.slice(end), start + token.length);
    },
  }));

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const hit = tokenAt(display, el.selectionStart, byLabel, e.key === 'Backspace' ? 'before' : 'after');
    if (!hit) return;
    e.preventDefault();
    commit(display.slice(0, hit[0]) + display.slice(hit[1]), hit[0]);
  };

  // La capa de atrás: el mismo texto, con los recuadros pintados. El texto
  // es transparente: el que se ve es el del textarea.
  const painted = useMemo(() => {
    const out: (string | { label: string; tone: MarkerTone; raw: string })[] = [];
    let last = 0;
    for (const m of display.matchAll(TOKEN)) {
      const def = byLabel.get(m[1]);
      if (!def) continue;
      const at = m.index ?? 0;
      if (at > last) out.push(display.slice(last, at));
      out.push({ label: def.label, tone: def.tone, raw: m[0] });
      last = at + m[0].length;
    }
    out.push(display.slice(last));
    return out;
  }, [display, byLabel]);

  return (
    <div className="relative rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] focus-within:border-indigo-500">
      <div
        ref={backdrop}
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden text-transparent ${SHARED}`}
        style={{ right: scrollbar }}
      >
        {painted.map((part, i) =>
          typeof part === 'string' ? (
            <span key={i}>{part}</span>
          ) : (
            <mark
              key={i}
              className="rounded text-transparent"
              style={{ background: TONE_BG[part.tone], boxShadow: `0 0 0 2px ${TONE_BG[part.tone]}` }}
            >
              {part.raw}
            </mark>
          ),
        )}
        {/* Un salto final no ocupa línea en un div: el espacio la fuerza. */}
        {display.endsWith('\n') ? ' ' : null}
      </div>
      <textarea
        id={id}
        ref={area}
        value={display}
        rows={rows}
        spellCheck={false}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onScroll={(e) => {
          if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className={`relative block w-full resize-y bg-transparent text-[var(--text-primary)] caret-[var(--text-primary)] outline-none ${SHARED}`}
      />
    </div>
  );
});
