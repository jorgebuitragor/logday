import { Fragment, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, X, Plus, GripVertical, Trash2, ListTodo } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { Task } from '../../types/task';
import {
  toISO,
  dateFromISO,
  getPreviousWorkingDay,
  buildDailyCopyText,
} from '../../lib/colombianHolidays';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { t } from '../../lib/i18n';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { absenceTypeLabel } from '../../lib/absenceLabel';

const ESTIMATED_ACTIVITY_CTX_MENU = { width: 172, height: 84 };

function formatShortDate(iso: string, language: 'es' | 'en'): string {
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const d = new Date(iso + 'T12:00:00');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  if (language === 'es') return `${weekday}, ${d.getDate()} de ${month}`;
  return `${weekday}, ${month} ${d.getDate()}`;
}

function formatLongDate(iso: string, language: 'es' | 'en'): string {
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const d = new Date(iso + 'T12:00:00');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  if (language === 'es') return `${weekday}, ${d.getDate()} de ${month} de ${d.getFullYear()}`;
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

async function writeToClipboard(text: string): Promise<void> {
  // 1) navigator.clipboard — funciona con UTF-8 nativo en el WebView de Tauri
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* continúa */ }
  // 2) execCommand fallback (en macOS suele preservar mejor acentos que pbcopy)
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (ok) return;
  } catch { /* continúa */ }
  // 3) Comando Rust via pbcopy/clip (último fallback)
  try {
    await invoke('write_clipboard', { text });
    return;
  } catch { /* continúa */ }

  throw new Error('No se pudo copiar al portapapeles');
}

// ── Helpers para convertir entre string almacenado y array de items ───────────

// Una actividad = una línea física en el string guardado. Un salto de línea
// interno (Shift+Enter al editar) se escapa para no romper ese invariante.
function escapeItemText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function unescapeItemText(text: string): string {
  return text.replace(/\\(\\|n)/g, (_, c: string) => (c === 'n' ? '\n' : '\\'));
}

function parseItems(stored: string): string[] {
  return stored
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => unescapeItemText(l.slice(2)));
}

function serializeItems(items: string[]): string {
  return items.map((i) => `- ${escapeItemText(i)}`).join('\n');
}

// ── Drag & drop entre paneles ──────────────────────────────────────────────

/** Punto de inserción actual: en qué lista y en qué "hueco" entre actividades
 * (gapIdx null = al final de la lista). Vive en DailyEditor() para que ambos
 * paneles puedan dibujar la línea de inserción, sin importar cuál de los dos
 * inició el arrastre. */
interface DropTarget {
  listId: string;
  gapIdx: number | null;
}

// Margen de histéresis (px) alrededor de la mitad de una fila: una vez
// decidido un lado, hace falta cruzar claramente al otro lado del margen
// para cambiar — evita que micro-movimientos del mouse cerca del centro
// hagan parpadear la línea de inserción entre "antes" y "después".
const DROP_HYSTERESIS_PX = 6;

// Distancia mínima que debe moverse el puntero desde que se presiona el
// grip antes de considerar que el arrastre realmente empezó.
const DRAG_START_THRESHOLD_PX = 4;

/** Resuelve, a partir de coordenadas de puntero, en qué lista (`data-list-id`)
 * y en qué hueco entre filas (según la mitad de la fila sobre la que está el
 * cursor) caería el elemento si se soltara ahí. `prevTarget` es el último
 * resultado de esta misma sesión de arrastre, usado para aplicar histéresis
 * cuando el cursor sigue sobre la misma fila. */
function resolveDropTarget(ev: PointerEvent, prevTarget: DropTarget | null): DropTarget | null {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const itemEl = el?.closest('[data-item-idx]') as HTMLElement | null;
  const containerEl = el?.closest('[data-list-id]') as HTMLElement | null;
  const listId = itemEl?.getAttribute('data-list-id') ?? containerEl?.getAttribute('data-list-id') ?? null;
  if (!listId) return null;
  if (itemEl && itemEl.getAttribute('data-list-id') === listId) {
    const idx = Number(itemEl.getAttribute('data-item-idx'));
    const rect = itemEl.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const onSameRow = prevTarget?.listId === listId && (prevTarget.gapIdx === idx || prevTarget.gapIdx === idx + 1);
    const gapIdx = onSameRow
      ? (ev.clientY < mid - DROP_HYSTERESIS_PX ? idx : ev.clientY > mid + DROP_HYSTERESIS_PX ? idx + 1 : prevTarget!.gapIdx)
      : (ev.clientY < mid ? idx : idx + 1);
    return { listId, gapIdx };
  }
  return { listId, gapIdx: null };
}

/** Línea delgada que marca el punto exacto de inserción entre dos actividades
 * (o al inicio/final de la lista) — mismo patrón que RootDropLine.tsx en el
 * Sidebar, siempre montada para que el espacio se anime al abrirse/cerrarse
 * en vez de aparecer de golpe. */
function DropLine({ active }: { active: boolean }) {
  return (
    <div
      className={`rounded-full transition-all duration-150 ${
        active ? 'my-1 h-1.5 bg-indigo-500' : 'my-[3px] h-0 bg-transparent'
      }`}
    />
  );
}

// ── Componente ActivityList ───────────────────────────────────────────────────

interface ActivityListProps {
  /** Contenido almacenado como "- item1\n- item2\n..." */
  value: string;
  onChange: (v: string) => void;
  /** Identifica este panel ("prev" | "today") para el drag & drop entre paneles. */
  listId: string;
  dropTarget: DropTarget | null;
  onDragHover?: (target: DropTarget | null) => void;
  onCrossListDrop?: (fromIdx: number, toListId: string, toIdx: number | null) => void;
  accent?: boolean;
  autoFocus?: boolean;
  onPromoteToTask?: (text: string) => void;
  taskSuggestions?: Task[];
  language: 'es' | 'en';
}

function ActivityList({ value, onChange, listId, dropTarget, onDragHover, onCrossListDrop, accent, autoFocus, onPromoteToTask, taskSuggestions, language }: ActivityListProps) {
  const [inputVal, setInputVal] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [promotedIdx, setPromotedIdx] = useState<number | null>(null);
  const [pendingPromoteText, setPendingPromoteText] = useState<string | null>(null);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const [cursorPos, setCursorPos] = useState(0);
  const [editCursorPos, setEditCursorPos] = useState(0);
  const [activityCtxMenu, setActivityCtxMenu] = useState<{ idx: number; x: number; y: number } | null>(null);
  const activityCtxMenuLayout = usePositionedMenu(activityCtxMenu, {
    estimatedSize: ESTIMATED_ACTIVITY_CTX_MENU,
    onClose: () => setActivityCtxMenu(null),
  });
  const dragSrcIdx = useRef<number | null>(null);
  const itemsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  const onDragHoverRef = useRef(onDragHover);
  const onCrossListDropRef = useRef(onCrossListDrop);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const items = useMemo(() => parseItems(value), [value]);
  itemsRef.current = items;
  onChangeRef.current = onChange;
  onDragHoverRef.current = onDragHover;
  onCrossListDropRef.current = onCrossListDrop;

  // ── Añadir ─────────────────────────────────────────────────────────────────
  const addItem = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange(serializeItems([...items, trimmed]));
    setInputVal('');
  };

  // ── Eliminar ────────────────────────────────────────────────────────────────
  const removeItem = (idx: number) => {
    onChange(serializeItems(items.filter((_, i) => i !== idx)));
  };

  // ── Edición inline ──────────────────────────────────────────────────────────
  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditVal(items[idx]);
    setEditCursorPos(items[idx].length);
    setSuggestIdx(-1);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const trimmed = editVal.trim();
    const updated = [...items];
    if (!trimmed) {
      updated.splice(editingIdx, 1);
    } else {
      updated[editingIdx] = trimmed;
    }
    onChange(serializeItems(updated));
    setEditingIdx(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) return; // deja que el textarea inserte el salto de línea
    if (filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx((i) => Math.max(i - 1, -1)); return; }
      if (e.key === 'Enter' && suggestIdx >= 0) { e.preventDefault(); handleSelectSuggestion(filteredSuggestions[suggestIdx]); return; }
      if (e.key === 'Escape') { setSuggestIdx(-1); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditingIdx(null); }
  };

  // ── Drag & drop via pointer events (fiable en WebKit/Tauri) ─────────────────
  const handleGripPointerDown = (e: React.PointerEvent, idx: number) => {
    // No iniciar drag mientras hay una edición activa para evitar conflictos de estado
    if (editingIdx !== null) {
      commitEdit();
      return;
    }
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    dragSrcIdx.current = idx;
    let active = false;
    let lastTarget: DropTarget | null = null;

    const handlePointerMove = (ev: PointerEvent) => {
      if (!active) {
        // Umbral mínimo antes de "tomar" la actividad: evita que un
        // micro-temblor del mouse justo al presionar el grip ya dispare
        // el fantasma/línea de inserción.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START_THRESHOLD_PX) return;
        active = true;
        setDraggingIdx(idx);
      }
      setGhostPos({ x: ev.clientX, y: ev.clientY });
      lastTarget = resolveDropTarget(ev, lastTarget);
      onDragHoverRef.current?.(lastTarget);
    };

    const handlePointerUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      const src = dragSrcIdx.current;
      dragSrcIdx.current = null;
      setDraggingIdx(null);
      setGhostPos(null);
      onDragHoverRef.current?.(null);

      if (!active || src === null) return;
      const target = resolveDropTarget(ev, lastTarget);
      if (!target) return;

      if (target.listId === listId) {
        const gapIdx = target.gapIdx ?? itemsRef.current.length;
        const insertAt = gapIdx > src ? gapIdx - 1 : gapIdx;
        if (insertAt !== src) {
          const updated = [...itemsRef.current];
          const [moved] = updated.splice(src, 1);
          updated.splice(insertAt, 0, moved);
          onChangeRef.current(serializeItems(updated));
        }
      } else {
        onCrossListDropRef.current?.(src, target.listId, target.gapIdx);
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  // ── Promover a tarea ────────────────────────────────────────────────────────
  const handlePromote = (idx: number) => {
    if (!onPromoteToTask) return;
    setPendingPromoteText(items[idx]);
  };

  const confirmPromote = () => {
    if (!pendingPromoteText || !onPromoteToTask) return;
    const idx = items.indexOf(pendingPromoteText);
    onPromoteToTask(pendingPromoteText);
    setPendingPromoteText(null);
    if (idx >= 0) {
      setPromotedIdx(idx);
      setTimeout(() => setPromotedIdx(null), 1800);
    }
  };

  // ── Sugerencias de tareas existentes ───────────────────────────────────────
  // Modo #code: detecta "#..." justo antes del cursor en cualquier posición
  // Funciona tanto en el input nuevo como en el input de edición
  const isEditing = editingIdx !== null;
  const activeVal = isEditing ? editVal : inputVal;
  const activeCursor = isEditing ? editCursorPos : cursorPos;

  const getHashFragment = (): { query: string; start: number } | null => {
    const before = activeVal.slice(0, activeCursor);
    const m = before.match(/#([a-zA-Z0-9\-_]*)$/);
    if (!m) return null;
    return { query: m[1], start: activeCursor - m[0].length };
  };
  const hashFragment = getHashFragment();
  const isHashMode = hashFragment !== null;
  const filteredSuggestions = useMemo(() => {
    if (!taskSuggestions) return [];
    if (isHashMode) {
      const q = (hashFragment?.query ?? '').toLowerCase();
      return taskSuggestions
        .filter((t) => t.taskCode && t.taskCode.toLowerCase().includes(q))
        .slice(0, 6);
    }
    if (activeVal.length < 2) return [];
    const q = activeVal.toLowerCase();
    return taskSuggestions.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskSuggestions, activeVal, isHashMode, hashFragment?.query]);

  // Auto-resize del textarea de edición
  useEffect(() => {
    const el = editInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [editVal, editingIdx]);

  const handleSelectSuggestion = (task: Task) => {
    if (isHashMode && task.taskCode && hashFragment) {
      const proj = task.project && task.project !== 'inbox'
        ? task.project.split('/').filter(Boolean).pop() ?? ''
        : '';
      const suffix = proj ? ` (${proj})` : '';
      const replacement = `#${task.taskCode} - ${task.title}${suffix}`;
      const newVal =
        activeVal.slice(0, hashFragment.start) +
        replacement +
        activeVal.slice(activeCursor);
      const newCursor = hashFragment.start + replacement.length;
      if (isEditing) {
        setEditVal(newVal);
        setEditCursorPos(newCursor);
      } else {
        setInputVal(newVal);
        setCursorPos(newCursor);
      }
    } else {
      if (isEditing) {
        setEditVal(task.title);
        setEditCursorPos(task.title.length);
      } else {
        setInputVal(task.title);
        setCursorPos(task.title.length);
      }
    }
    setSuggestIdx(-1);
    if (isEditing) editInputRef.current?.focus();
    else inputRef.current?.focus();
  };

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const itemBase = 'group relative flex items-center gap-2 rounded-lg border px-2 py-2 text-sm leading-snug transition-colors';
  const itemNormal = accent
    ? `${itemBase} border-indigo-500/20 bg-indigo-500/5 text-[var(--text-body)]`
    : `${itemBase} border-[var(--border-card)] bg-[var(--bg-base)] text-[var(--text-body)]`;

  const isOwnGapActive = (gap: number) =>
    dropTarget?.listId === listId && (dropTarget.gapIdx ?? items.length) === gap;

  return (
    <>
    <div className="flex flex-col" data-list-id={listId}>
      <DropLine active={isOwnGapActive(0)} />
      {items.map((item, idx) => (
        <Fragment key={idx}>
        <div
          data-item-idx={idx}
          data-list-id={listId}
          className={`${itemNormal} ${draggingIdx === idx ? 'opacity-40' : ''}`}
        >
          {/* Handle de arrastre */}
          <GripVertical
            size={13}
            onPointerDown={(e) => handleGripPointerDown(e, idx)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setActivityCtxMenu({ idx, x: e.clientX, y: e.clientY }); }}
            className="shrink-0 cursor-grab touch-none text-[var(--text-faint)] opacity-0 transition group-hover:opacity-60 active:cursor-grabbing"
          />

          {/* Texto / input de edición */}
          {editingIdx === idx ? (
            <div className="relative flex-1">
              <textarea
                ref={editInputRef}
                autoFocus
                rows={1}
                value={editVal}
                onChange={(e) => { setEditVal(e.target.value); setEditCursorPos(e.target.selectionStart ?? e.target.value.length); setSuggestIdx(-1); }}
                onKeyDown={handleEditKeyDown}
                onBlur={() => { setTimeout(commitEdit, 150); }}
                className="w-full resize-none overflow-hidden bg-transparent text-sm leading-snug text-[var(--text-body)] outline-none"
              />
              {filteredSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] shadow-xl">
                  <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)]">
                    {t(language, 'dailys', isHashMode ? 'taskCodeSuggestHint' : 'existingTasksHint')}
                  </p>
                  {filteredSuggestions.map((task, i) => (
                    <button
                      key={task.id}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(task); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                        suggestIdx === i
                          ? 'bg-indigo-500/10 text-[var(--text-primary)]'
                          : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <ListTodo size={11} className="shrink-0 text-indigo-400" />
                      {isHashMode && task.taskCode ? (
                        <>
                          <span className="font-mono text-indigo-400">#{task.taskCode}</span>
                          <span className="flex-1 truncate text-[var(--text-secondary)]">
                            - {task.title}
                            {task.project && task.project !== 'inbox' && (
                              <span className="ml-1 text-[var(--text-faint)]">
                                ({task.project.split('/').filter(Boolean).pop()})
                              </span>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="flex-1 truncate">{task.title}</span>
                      )}
                      <span className="text-[9px] text-[var(--text-faint)]">{task.project}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span
              className="flex-1 cursor-text select-none whitespace-pre-wrap"
              onClick={() => startEdit(idx)}
              title={t(language, 'dailys', 'clickEditDrag')}
            >
              {item}
            </span>
          )}

          {/* Acciones al hover */}
          {editingIdx !== idx && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              {onPromoteToTask && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePromote(idx); }}
                  disabled={promotedIdx === idx}
                  className={`rounded p-0.5 transition ${
                    promotedIdx === idx
                      ? 'text-emerald-400 cursor-default'
                      : 'text-[var(--text-faint)] hover:bg-indigo-500/10 hover:text-indigo-400'
                  }`}
                  title={t(language, 'dailys', 'promoteTaskTitle')}
                >
                  {promotedIdx === idx ? <Check size={11} /> : <ListTodo size={11} />}
                </button>
              )}
              <button
                onClick={() => removeItem(idx)}
                className="rounded p-0.5 text-[var(--text-faint)] transition hover:bg-red-500/10 hover:text-red-400"
                title={t(language, 'dailys', 'removeTitle')}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
        <DropLine active={isOwnGapActive(idx + 1)} />
        </Fragment>
      ))}

      {/* Input para añadir nueva actividad + sugerencias */}
      <div className="relative mt-1">
        <div
          className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 ${
            accent ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-[var(--border-card)]'
          }`}
        >
          <Plus size={12} className={accent ? 'text-indigo-400' : 'text-[var(--text-faint)]'} />
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setCursorPos(e.target.selectionStart ?? e.target.value.length); setSuggestIdx(-1); }}
            onKeyDown={(e) => {
              if (filteredSuggestions.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx((i) => Math.max(i - 1, -1)); return; }
                if (e.key === 'Enter' && suggestIdx >= 0) { e.preventDefault(); handleSelectSuggestion(filteredSuggestions[suggestIdx]); return; }
                if (e.key === 'Escape') { setSuggestIdx(-1); setInputVal(''); return; }
              }
              if (e.key === 'Enter') { e.preventDefault(); addItem(inputVal); }
            }}
            onBlur={() => { if (inputVal.trim()) addItem(inputVal); }}
            placeholder={t(language, 'dailys', 'newActivityPlaceholder')}
            autoFocus={autoFocus}
            className="flex-1 bg-transparent text-sm text-[var(--text-body)] outline-none placeholder-[var(--text-faint)]"
          />
        </div>
        {filteredSuggestions.length > 0 && !isEditing && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] shadow-xl">
            <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)]">
              {t(language, 'dailys', isHashMode ? 'taskCodeSuggestHint' : 'existingTasksHint')}
            </p>
            {filteredSuggestions.map((task, i) => (
              <button
                key={task.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(task); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                  suggestIdx === i
                    ? 'bg-indigo-500/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <ListTodo size={11} className="shrink-0 text-indigo-400" />
                {isHashMode && task.taskCode ? (
                  <>
                    <span className="font-mono text-indigo-400">#{task.taskCode}</span>
                    <span className="flex-1 truncate text-[var(--text-secondary)]">
                      - {task.title}
                      {task.project && task.project !== 'inbox' && (
                        <span className="ml-1 text-[var(--text-faint)]">
                          ({task.project.split('/').filter(Boolean).pop()})
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="flex-1 truncate">{task.title}</span>
                )}
                <span className="text-[9px] text-[var(--text-faint)]">{task.project}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>

      {/* Modal confirmación de promoción */}
      {pendingPromoteText && (
        <ModalOverlay onClose={() => setPendingPromoteText(null)}>
          <ModalPanel className="modal-spring-in w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-indigo-400">
              <ListTodo size={16} />
              <h3 className="text-sm font-semibold">{t(language, 'dailys', 'promoteModalTitle')}</h3>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-hint)]">
              {t(language, 'dailys', 'promoteModalDesc')}
            </p>
            <p className="mt-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-base)] px-3 py-2 text-xs font-medium text-[var(--text-body)]">
              {pendingPromoteText}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-faint)]">
              {t(language, 'dailys', 'promoteModalHint')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingPromoteText(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'dailys', 'cancel')}
              </button>
              <button
                onClick={confirmPromote}
                className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 transition hover:bg-indigo-500/20"
              >
                {t(language, 'dailys', 'createTask')}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Menú contextual de actividad */}
      {activityCtxMenu && createPortal(
        <div
          ref={activityCtxMenuLayout.ref}
          style={{ ...activityCtxMenuLayout.style, zIndex: 9999 }}
          className="min-w-[172px] overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] py-1 shadow-2xl"
        >
          <button
            onClick={() => {
              navigator.clipboard.writeText(items[activityCtxMenu.idx]);
              setActivityCtxMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[var(--text-body)] transition hover:bg-[var(--bg-hover)]"
          >
            <Copy size={11} className="shrink-0 text-[var(--text-hint)]" />
            {t(language, 'dailys', 'activityCtxCopy')}
          </button>
          <div className="mx-2 border-t border-[var(--border)]" />
          <button
            onClick={() => {
              removeItem(activityCtxMenu.idx);
              setActivityCtxMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 size={11} className="shrink-0" />
            {t(language, 'dailys', 'activityCtxDelete')}
          </button>
        </div>,
        document.body,
      )}

      {/* Fantasma que sigue el cursor mientras se arrastra una actividad */}
      {draggingIdx !== null && ghostPos && createPortal(
        <div
          style={{ left: ghostPos.x + 14, top: ghostPos.y + 6, pointerEvents: 'none', position: 'fixed', zIndex: 9999, maxWidth: 260 }}
          className="rounded-lg border border-indigo-400/60 bg-[var(--bg-panel)] px-3 py-2 text-xs text-[var(--text-body)] shadow-2xl opacity-90"
        >
          <p className="truncate">{items[draggingIdx]?.replace(/\n/g, ' ')}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

export function DailyEditor() {
  const {
    activeSection,
    activeDailyDate,
    dailyEntries,
    saveDailyEntry,
    deleteDailyEntry,
    setActiveDailyDate,
    copyDailyFormat,
    loadDailyMonth,
    tasks,
    createTask,
    updateTask,
    language,
    confirmDestructiveActions,
    absenceDays,
  } = useAppStore();

  const [todayActs, setTodayActs] = useState('');
  const [prevActs, setPrevActs] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);
  const todaySave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevDate = useMemo(() => {
    if (!activeDailyDate) return null;
    const absenceDates = new Set(absenceDays.map((a) => a.date));
    return getPreviousWorkingDay(dateFromISO(activeDailyDate), absenceDates);
  }, [activeDailyDate, absenceDays]);

  const prevISO = useMemo(() => (prevDate ? toISO(prevDate) : null), [prevDate]);

  const prevAbsence = prevISO ? absenceDays.find((a) => a.date === prevISO) ?? null : null;
  const activeAbsence = activeDailyDate ? absenceDays.find((a) => a.date === activeDailyDate) ?? null : null;

  // Cargar mes del día anterior si es distinto
  useEffect(() => {
    if (!prevISO) return;
    loadDailyMonth(prevISO.slice(0, 7));
  }, [prevISO]);


  // Sincronizar hoy
  useEffect(() => {
    if (activeDailyDate) {
      setTodayActs(dailyEntries[activeDailyDate] ?? '');
    }
  }, [activeDailyDate]);

  // Sincronizar día anterior cuando se carga
  useEffect(() => {
    if (prevISO !== null) {
      setPrevActs(dailyEntries[prevISO] ?? '');
    }
  }, [prevISO, dailyEntries]);

  const previewText = useMemo(() => {
    if (!activeDailyDate || !prevDate) return '';
    return buildDailyCopyText(prevDate, prevActs, dateFromISO(activeDailyDate), todayActs);
  }, [activeDailyDate, prevDate, prevActs, todayActs]);

  const handleTodayChange = useCallback(
    (val: string) => {
      setTodayActs(val);
      if (!activeDailyDate) return;
      if (todaySave.current) clearTimeout(todaySave.current);
      setSaving(true);
      todaySave.current = setTimeout(async () => {
        await saveDailyEntry(activeDailyDate, val);
        setSaving(false);
      }, 800);
    },
    [activeDailyDate, saveDailyEntry]
  );

  const handlePrevChange = useCallback(
    (val: string) => {
      setPrevActs(val);
      if (!prevISO) return;
      if (prevSave.current) clearTimeout(prevSave.current);
      prevSave.current = setTimeout(async () => {
        await saveDailyEntry(prevISO, val);
      }, 800);
    },
    [prevISO, saveDailyEntry]
  );

  // ── Arrastrar actividades entre el panel "anterior" y el de "hoy" ──────────
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const handleCrossListDrop = useCallback(
    (fromListId: 'prev' | 'today', fromIdx: number, toListId: string, toIdx: number | null) => {
      const srcActs = fromListId === 'today' ? todayActs : prevActs;
      const tgtActs = toListId === 'today' ? todayActs : prevActs;
      const srcArr = parseItems(srcActs);
      const tgtArr = fromListId === toListId ? srcArr : parseItems(tgtActs);
      const [moved] = srcArr.splice(fromIdx, 1);
      if (moved === undefined) return;
      tgtArr.splice(toIdx ?? tgtArr.length, 0, moved);
      (fromListId === 'today' ? handleTodayChange : handlePrevChange)(serializeItems(srcArr));
      (toListId === 'today' ? handleTodayChange : handlePrevChange)(serializeItems(tgtArr));
    },
    [todayActs, prevActs, handleTodayChange, handlePrevChange]
  );

  const handleCopy = async () => {
    if (!activeDailyDate) return;
    if (todaySave.current) { clearTimeout(todaySave.current); todaySave.current = null; }
    if (prevSave.current) { clearTimeout(prevSave.current); prevSave.current = null; }
    await saveDailyEntry(activeDailyDate, todayActs);
    if (prevISO) await saveDailyEntry(prevISO, prevActs);
    const text = await copyDailyFormat(activeDailyDate);
    await writeToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePromoteToTask = useCallback(async (text: string) => {
    const task = await createTask(text);
    if (activeDailyDate) {
      await updateTask({ ...task, due: activeDailyDate });
    }
  }, [createTask, updateTask, activeDailyDate]);

  const handleDelete = async () => {
    if (!activeDailyDate) return;
    if (todaySave.current) clearTimeout(todaySave.current);
    if (prevSave.current) clearTimeout(prevSave.current);
    await deleteDailyEntry(activeDailyDate);
  };

  if (activeSection !== 'dailys') return null;

  if (!activeDailyDate) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <p className="text-sm text-[var(--text-hint)]">{t(language, 'dailys', 'selectOrCreate')}</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            {t(language, 'dailys', 'selectOrCreateHint')}
          </p>
        </div>
      </div>
    );
  }

  const isToday = activeDailyDate === toISO(new Date());

  return (
    <>
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {formatLongDate(activeDailyDate, language)}
          </h2>
          {isToday && (
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-400">
              {t(language, 'dailys', 'todayBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {saving && <span className="text-[10px] text-[var(--text-faint)]">{t(language, 'dailys', 'saving')}</span>}
          <button
            onClick={handleCopy}
            className={`flex items-center justify-center rounded-lg p-1.5 text-xs transition ${
              copied
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
            }`}
            title={t(language, 'dailys', 'copyFormattedTitle')}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => confirmDeleteDialog.request(true, () => void handleDelete())}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-red-500/10 hover:text-red-400"
            title={t(language, 'dailys', 'deleteThisDailyTitle')}
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setActiveDailyDate(null)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title={t(language, 'dailys', 'close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Paneles */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">

        {/* Panel: día hábil anterior */}
        {prevISO && (
          <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-card)] px-4 py-2.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">
                {t(language, 'dailys', 'previousPanel')}
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {formatShortDate(prevISO, language)}
              </span>
              {prevAbsence && (
                <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-400">
                  {absenceTypeLabel(language, prevAbsence.type)}
                </span>
              )}
            </div>
            <div className="px-4 py-3">
              <ActivityList
                value={prevActs}
                onChange={handlePrevChange}
                listId="prev"
                dropTarget={dropTarget}
                onDragHover={setDropTarget}
                onCrossListDrop={(fromIdx, toListId, toIdx) => handleCrossListDrop('prev', fromIdx, toListId, toIdx)}
                onPromoteToTask={handlePromoteToTask}
                taskSuggestions={tasks}
                language={language}
              />
            </div>
          </div>
        )}

        {/* Panel: hoy / seleccionado */}
        <div className="rounded-xl border-2 border-indigo-500/40 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 border-b border-indigo-500/20 px-4 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">
              {isToday ? t(language, 'dailys', 'todayBtn') : t(language, 'dailys', 'selectedPanel')}
            </span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {formatShortDate(activeDailyDate, language)}
            </span>
            {activeAbsence && (
              <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-400">
                {absenceTypeLabel(language, activeAbsence.type)}
              </span>
            )}
          </div>
          <div className="px-4 py-3">
            <ActivityList
              value={todayActs}
              onChange={handleTodayChange}
              listId="today"
              dropTarget={dropTarget}
              onDragHover={setDropTarget}
              onCrossListDrop={(fromIdx, toListId, toIdx) => handleCrossListDrop('today', fromIdx, toListId, toIdx)}
              accent
              autoFocus
              onPromoteToTask={handlePromoteToTask}
              taskSuggestions={tasks}
              language={language}
            />
          </div>
        </div>

        {/* Vista previa */}
        <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">
              {t(language, 'dailys', 'previewTitle')}
            </p>
            <button
              onClick={handleCopy}
              className={`flex items-center justify-center rounded-lg p-1 transition ${
                copied
                  ? 'text-emerald-400'
                  : 'text-[var(--text-faint)] hover:text-indigo-400'
              }`}
              title={t(language, 'dailys', 'copyFormattedTitle')}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <p className="select-text whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-tertiary)]">
            {previewText || t(language, 'dailys', 'previewEmpty')}
          </p>
        </div>



        <p className="pb-2 text-center text-[10px] text-[var(--text-faint)]">
          {t(language, 'dailys', 'autosaveHint')}
        </p>
      </div>
    </div>

    {/* Modal de confirmación de borrado */}
    {confirmDeleteDialog.isOpen && activeDailyDate && (
      <ConfirmDeleteModal
        variant="soft"
        title={t(language, 'dailys', 'deleteDailyTitle')}
        message={
          <>
            {t(language, 'dailys', 'deleteConfirmPrefix')}{' '}
            <span className="font-medium text-[var(--text-body)]">{formatLongDate(activeDailyDate, language)}</span>.
            {' '}{t(language, 'dailys', 'deleteConfirmSuffix')}
          </>
        }
        cancelLabel={t(language, 'dailys', 'cancel')}
        confirmLabel={t(language, 'dailys', 'delete')}
        onCancel={confirmDeleteDialog.cancel}
        onConfirm={() => { confirmDeleteDialog.cancel(); void handleDelete(); }}
      />
    )}
    </>
  );
}
