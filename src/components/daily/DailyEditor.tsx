import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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

function parseItems(stored: string): string[] {
  return stored
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2));
}

function serializeItems(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

// ── Componente ActivityList ───────────────────────────────────────────────────

interface ActivityListProps {
  /** Contenido almacenado como "- item1\n- item2\n..." */
  value: string;
  onChange: (v: string) => void;
  accent?: boolean;
  autoFocus?: boolean;
  onPromoteToTask?: (text: string) => void;
  taskSuggestions?: Task[];
  language: 'es' | 'en';
}

function ActivityList({ value, onChange, accent, autoFocus, onPromoteToTask, taskSuggestions, language }: ActivityListProps) {
  const [inputVal, setInputVal] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const items = useMemo(() => parseItems(value), [value]);
  itemsRef.current = items;
  onChangeRef.current = onChange;

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
    dragSrcIdx.current = idx;
    setDraggingIdx(idx);

    const handlePointerMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const itemEl = el?.closest('[data-item-idx]');
      const targetIdx = itemEl ? Number(itemEl.getAttribute('data-item-idx')) : null;
      setDragOverIdx(targetIdx !== dragSrcIdx.current ? targetIdx : null);
    };

    const handlePointerUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      const src = dragSrcIdx.current;
      dragSrcIdx.current = null;
      setDraggingIdx(null);
      setDragOverIdx(null);

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const itemEl = el?.closest('[data-item-idx]');
      const tgt = itemEl ? Number(itemEl.getAttribute('data-item-idx')) : null;

      if (src !== null && tgt !== null && src !== tgt) {
        const updated = [...itemsRef.current];
        const [moved] = updated.splice(src, 1);
        updated.splice(tgt, 0, moved);
        onChangeRef.current(serializeItems(updated));
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
  const itemDragOver = 'border-indigo-400/60 bg-indigo-500/10 scale-[1.01]';

  return (
    <>
    <div className="flex flex-col gap-1.5">
      {items.map((item, idx) => (
        <div
          key={idx}
          data-item-idx={idx}
          className={`${itemNormal} ${dragOverIdx === idx ? itemDragOver : ''} ${draggingIdx === idx ? 'opacity-40' : ''}`}
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
              className="flex-1 cursor-text select-none"
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
      ))}

      {/* Input para añadir nueva actividad + sugerencias */}
      <div className="relative">
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
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/50">
          <div className="modal-spring-in w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-2xl">
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
          </div>
        </div>
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
            </div>
            <div className="px-4 py-3">
              <ActivityList
                value={prevActs}
                onChange={handlePrevChange}
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
          </div>
          <div className="px-4 py-3">
            <ActivityList
              value={todayActs}
              onChange={handleTodayChange}
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
