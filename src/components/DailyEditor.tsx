import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Copy, Check, X, Plus, GripVertical, Trash2, ListTodo } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/appStore';
import { Task } from '../types';
import { placeMenuAtPointer } from '../lib/menuPosition';
import {
  toISO,
  dateFromISO,
  getPreviousWorkingDay,
  buildDailyCopyText,
} from '../lib/colombianHolidays';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ESTIMATED_PREVIEW_CTX_MENU = { width: 160, height: 46 };

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function formatLongDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

async function writeToClipboard(text: string): Promise<void> {
  // 1) navigator.clipboard — funciona con UTF-8 nativo en el WebView de Tauri
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* continúa */ }
  // 2) Comando Rust via pbcopy/clip (fallback)
  try {
    await invoke('write_clipboard', { text });
    return;
  } catch { /* continúa */ }
  // 3) execCommand fallback
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
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
}

function ActivityList({ value, onChange, accent, autoFocus, onPromoteToTask, taskSuggestions }: ActivityListProps) {
  const [inputVal, setInputVal] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [promotedIdx, setPromotedIdx] = useState<number | null>(null);
  const [pendingPromoteText, setPendingPromoteText] = useState<string | null>(null);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const dragSrcIdx = useRef<number | null>(null);
  const itemsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  const filteredSuggestions = useMemo(() => {
    if (!taskSuggestions || inputVal.length < 2) return [];
    const q = inputVal.toLowerCase();
    return taskSuggestions.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5);
  }, [taskSuggestions, inputVal]);

  const handleSelectSuggestion = (task: Task) => {
    setInputVal(task.title);
    setSuggestIdx(-1);
    inputRef.current?.focus();
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
            className="shrink-0 cursor-grab touch-none text-[var(--text-faint)] opacity-0 transition group-hover:opacity-60 active:cursor-grabbing"
          />

          {/* Texto / input de edición */}
          {editingIdx === idx ? (
            <input
              autoFocus
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEdit}
              className="flex-1 bg-transparent text-sm text-[var(--text-body)] outline-none"
            />
          ) : (
            <span
              className="flex-1 cursor-text select-none"
              onClick={() => startEdit(idx)}
              title="Clic para editar · Arrastra para reordenar"
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
                  title="Convertir en tarea"
                >
                  {promotedIdx === idx ? <Check size={11} /> : <ListTodo size={11} />}
                </button>
              )}
              <button
                onClick={() => removeItem(idx)}
                className="rounded p-0.5 text-[var(--text-faint)] transition hover:bg-red-500/10 hover:text-red-400"
                title="Eliminar"
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
            onChange={(e) => { setInputVal(e.target.value); setSuggestIdx(-1); }}
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
            placeholder="Nueva actividad… (Enter)"
            autoFocus={autoFocus}
            className="flex-1 bg-transparent text-sm text-[var(--text-body)] outline-none placeholder-[var(--text-faint)]"
          />
        </div>
        {filteredSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-panel)] shadow-xl">
            <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)]">
              Tareas existentes — clic para referenciar
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
                <span className="flex-1 truncate">{task.title}</span>
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
          <div className="w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-indigo-400">
              <ListTodo size={16} />
              <h3 className="text-sm font-semibold">Convertir en tarea</h3>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-hint)]">
              Se creará una nueva tarea con el título:
            </p>
            <p className="mt-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-base)] px-3 py-2 text-xs font-medium text-[var(--text-body)]">
              {pendingPromoteText}
            </p>
            <p className="mt-2 text-[10px] text-[var(--text-faint)]">
              Se asignará al día del daily como fecha de vencimiento.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingPromoteText(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPromote}
                className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 transition hover:bg-indigo-500/20"
              >
                Crear tarea
              </button>
            </div>
          </div>
        </div>
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
  } = useAppStore();

  const [todayActs, setTodayActs] = useState('');
  const [prevActs, setPrevActs] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewCtxMenu, setPreviewCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [previewCtxMenuPos, setPreviewCtxMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [previewCtxMenuReady, setPreviewCtxMenuReady] = useState(false);
  const previewCtxMenuRef = useRef<HTMLDivElement>(null);

  const todaySave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!previewCtxMenu || !previewCtxMenuRef.current) return;

    const recalc = () => {
      if (!previewCtxMenu || !previewCtxMenuRef.current) return;
      const rect = previewCtxMenuRef.current.getBoundingClientRect();
      setPreviewCtxMenuPos(
        placeMenuAtPointer(
          { x: previewCtxMenu.x, y: previewCtxMenu.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setPreviewCtxMenuReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [previewCtxMenu]);

  const prevDate = useMemo(() => {
    if (!activeDailyDate) return null;
    return getPreviousWorkingDay(dateFromISO(activeDailyDate));
  }, [activeDailyDate]);

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
    setShowDeleteConfirm(false);
  };

  if (activeSection !== 'dailys') return null;

  if (!activeDailyDate) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <p className="text-sm text-[var(--text-hint)]">Selecciona o crea un daily</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Usa el botón "Hoy" para registrar tus actividades de hoy
          </p>
        </div>
      </div>
    );
  }

  const isToday = activeDailyDate === toISO(new Date());

  return (
    <>
    <div key={activeDailyDate} className="animate-fade-in flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {formatLongDate(activeDailyDate)}
          </h2>
          {isToday && (
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-400">
              HOY
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {saving && <span className="text-[10px] text-[var(--text-faint)]">Guardando…</span>}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
              copied
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
            }`}
            title="Copiar mensaje formateado del daily"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '¡Copiado!' : 'Copiar formato'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-red-500/10 hover:text-red-400"
            title="Eliminar este daily"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setActiveDailyDate(null)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Cerrar"
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
                Previo
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {formatShortDate(prevISO)}
              </span>
            </div>
            <div className="px-4 py-3">
              <ActivityList
                value={prevActs}
                onChange={handlePrevChange}
                onPromoteToTask={handlePromoteToTask}
                taskSuggestions={tasks}
              />
            </div>
          </div>
        )}

        {/* Panel: hoy / seleccionado */}
        <div className="rounded-xl border-2 border-indigo-500/40 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 border-b border-indigo-500/20 px-4 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">
              {isToday ? 'Hoy' : 'Seleccionado'}
            </span>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {formatShortDate(activeDailyDate)}
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
            />
          </div>
        </div>

        {/* Vista previa */}
        <div
          className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3"
          onContextMenu={(e) => {
            e.preventDefault();
            setPreviewCtxMenuReady(false);
            setPreviewCtxMenuPos(
              placeMenuAtPointer(
                { x: e.clientX, y: e.clientY },
                ESTIMATED_PREVIEW_CTX_MENU,
                { padding: 8 },
              ),
            );
            setPreviewCtxMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">
            Vista previa · Copiar formato
          </p>
          <p className="select-text whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-tertiary)]">
            {previewText || '(escribe tus actividades arriba)'}
          </p>
        </div>

        {/* Menú contextual vista previa */}
        {previewCtxMenu && (
          <>
            <div
              className="fixed inset-0 z-[400]"
              onClick={() => {
                setPreviewCtxMenu(null);
                setPreviewCtxMenuPos(null);
                setPreviewCtxMenuReady(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setPreviewCtxMenu(null);
                setPreviewCtxMenuPos(null);
                setPreviewCtxMenuReady(false);
              }}
            />
            <div
              ref={previewCtxMenuRef}
              className="fixed z-[401] min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-xl"
              style={{ left: previewCtxMenuPos?.x ?? 8, top: previewCtxMenuPos?.y ?? 8, visibility: previewCtxMenuReady ? 'visible' : 'hidden' }}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
                onClick={async () => {
                  setPreviewCtxMenu(null);
                  setPreviewCtxMenuPos(null);
                  setPreviewCtxMenuReady(false);
                  await handleCopy();
                }}
              >
                <Copy size={12} />
                Copiar formato
              </button>
            </div>
          </>
        )}

        <p className="pb-2 text-center text-[10px] text-[var(--text-faint)]">
          Guardado automático · Festivos CO omitidos
        </p>
      </div>
    </div>

    {/* Modal de confirmación de borrado */}
    {showDeleteConfirm && activeDailyDate && (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50">
        <div className="w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-2xl">
          <div className="mb-3 flex items-center gap-2 text-red-400">
            <Trash2 size={16} />
            <h3 className="text-sm font-semibold">Eliminar daily</h3>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-hint)]">
            Se eliminará el registro del{' '}
            <span className="font-medium text-[var(--text-body)]">{formatLongDate(activeDailyDate)}</span>.
            Esta acción no se puede deshacer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
