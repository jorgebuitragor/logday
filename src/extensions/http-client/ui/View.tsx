// La pantalla del Cliente HTTP (specs/cliente-http HT33–HT35, Interfaz
// §11): a la izquierda, "Peticiones", los bloques ```http de todas las
// notas, agrupados por nota; a la derecha, el formulario. Elegir una la
// carga en el formulario; lo que se cambia ahí no toca la nota.
//
// La lista se lee de disco al montar la vista (al volver a ella), con
// "Actualizar" y, con una pausa, cuando cambian las notas del store
// (editar, crear, sincronizar). No vigila el disco.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, FileText, Plus, RotateCw, Search } from 'lucide-react';
import { useAppStore, readNoteFromPath } from '../../../store/appStore';
import { readAllNotes } from '../../../lib/allNotes';
import { FOCUS_RING, ICON_BTN, INPUT_CLS, PANEL_TITLE, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { Spinner, StatusItem } from '../../../components/shared/FormControls';
import {
  collectNoteRequests, countRequests, filterNoteRequests, requestTitle, shortUrl, type NoteRequest, type NoteRequestGroup,
} from '../core/noteRequests';
import { parseHttpBlock } from '../core/parse';
import { formFromBlock } from '../core/serialize';
import { isMac, makeTr, type Tr } from '../core/text';
import { announce } from '../announce';
import { firstError, issueMessage, loadForm, newForm, useHttpStore, type FormOrigin } from '../store';
import { RequestForm } from './RequestForm';

/** Tras un cambio en las notas, cuánto esperar para volver a leerlas. */
const RELOAD_DELAY_MS = 800;

const noteTitle = (tr: Tr, title: string) => title.trim() || tr('viewUntitled');

/** El primer error que la petición tiene en su nota, o `null`. */
export function requestErrorText(tr: Tr, req: Pick<NoteRequest, 'code' | 'requestIndex'>): string | null {
  const parsed = parseHttpBlock(req.code);
  const issue = firstError(parsed.issues.filter((i) => i.code !== 'too_many_requests'), parsed.requests[req.requestIndex]);
  return issue ? issueMessage(tr, issue) : null;
}

/** Lo que se carga en el formulario al elegir una petición de la columna. */
export function originOf(group: NoteRequestGroup, req: NoteRequest, tr: Tr): FormOrigin {
  return {
    noteId: group.note.id,
    title: noteTitle(tr, group.note.title),
    filePath: group.note.filePath,
    blockIndex: req.blockIndex,
    requestIndex: req.requestIndex,
    label: requestTitle(req),
  };
}

export default function HttpClientView() {
  const language = useAppStore((s) => s.language);
  const showToast = useAppStore((s) => s.showToast);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  const origin = useHttpStore((s) => s.origin);

  const [groups, setGroups] = useState<NoteRequestGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    try {
      const notes = await readAllNotes();
      if (id !== seq.current) return;
      setGroups(collectNoteRequests(notes));
      setFailed(false);
    } catch {
      if (id === seq.current) setFailed(true);
    } finally {
      if (id === seq.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    let timer: number | undefined;
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.notes === prev.notes && s.noteFolders === prev.noteFolders && s.basePath === prev.basePath) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), RELOAD_DELAY_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [reload]);

  const refresh = () => {
    setRefreshing(true);
    void reload();
  };

  const shown = useMemo(() => (groups ? filterNoteRequests(groups, query) : null), [groups, query]);
  const total = groups ? countRequests(groups) : 0;

  const choose = (group: NoteRequestGroup, req: NoteRequest) => {
    const loaded = formFromBlock(req.code, req.requestIndex);
    if (!loaded) return;
    const next = originOf(group, req, tr);
    loadForm(loaded.form, next);
    announce(tr('aLoaded', { label: next.label, title: next.title }));
  };

  const startNew = () => {
    newForm();
    announce(tr('aNew'));
  };

  const openNote = useCallback(
    async ({ filePath, noteId }: { filePath: string; noteId: string }) => {
      // Se vuelve a leer: la nota pudo cambiar desde que se armó la lista.
      const fresh = await readNoteFromPath(filePath).catch(() => null);
      const note = fresh ?? (await readAllNotes()).find((n) => n.id === noteId) ?? null;
      if (!note) {
        showToast({ kind: 'error', title: tr('viewOpenNoteError') });
        void reload();
        return;
      }
      const s = useAppStore.getState();
      s.setActiveNote(note);
      await s.setSection('notes');
    },
    [reload, showToast, tr],
  );

  // El error que la petición elegida tiene en su nota, si sigue en la lista.
  const loadedError = useMemo(() => {
    if (!origin || !groups) return null;
    const req = groups
      .find((g) => g.note.id === origin.noteId)
      ?.requests.find((r) => r.blockIndex === origin.blockIndex && r.requestIndex === origin.requestIndex);
    return req?.hasErrors ? requestErrorText(tr, req) : null;
  }, [origin, groups, tr]);

  return (
    // El contenedor de la consulta va aparte: una container query no aplica
    // al propio elemento que la declara, y con todo en uno la columna nunca
    // pasaba al costado (prueba del 31 oct 2026, a 1100 px).
    <div className="@container/httpview flex min-h-0 flex-1">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col @2xl/httpview:flex-row">
      <RequestsColumn
        tr={tr}
        groups={shown}
        total={total}
        failed={failed}
        refreshing={refreshing}
        query={query}
        onQuery={setQuery}
        onRefresh={refresh}
        onNew={startNew}
        onChoose={choose}
        origin={origin}
      />
      <section aria-labelledby="http-view-title" className="@container/tool flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <RequestForm tr={tr} mac={mac} loadedError={loadedError} onOpenNote={(t) => void openNote(t)} onSaved={refresh} />
      </section>
    </div>
    </div>
  );
}

export function RequestsColumn({
  tr, groups, total, failed, refreshing, query, onQuery, onRefresh, onNew, onChoose, origin,
}: {
  tr: Tr;
  /** Ya filtradas; `null` mientras se leen las notas por primera vez. */
  groups: NoteRequestGroup[] | null;
  /** Cuántas hay en total, sin filtrar. */
  total: number;
  failed: boolean;
  refreshing: boolean;
  query: string;
  onQuery: (query: string) => void;
  onRefresh: () => void;
  onNew: () => void;
  onChoose: (group: NoteRequestGroup, req: NoteRequest) => void;
  origin: FormOrigin | null;
}) {
  const isChosen = (group: NoteRequestGroup, req: NoteRequest) =>
    !!origin && origin.noteId === group.note.id && origin.blockIndex === req.blockIndex && origin.requestIndex === req.requestIndex;

  let content;
  if (failed && !groups) {
    content = <div className="px-2"><StatusItem kind="error">{tr('viewReadError')}</StatusItem></div>;
  } else if (!groups) {
    content = (
      <p className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--text-hint)]">
        <Spinner />
        {tr('viewLoading')}
      </p>
    );
  } else if (total === 0) {
    content = (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--border-card)] p-3 text-xs">
        <p className="font-medium text-[var(--text-secondary)]">{tr('viewEmptyTitle')}</p>
        <p className="leading-relaxed text-[var(--text-hint)]">{tr('viewEmpty')}</p>
      </div>
    );
  } else if (groups.length === 0) {
    content = <p className="px-2 py-3 text-xs text-[var(--text-hint)]">{tr('viewNoMatches', { query: query.trim() })}</p>;
  } else {
    content = groups.map((group) => {
      const title = noteTitle(tr, group.note.title);
      return (
        <section key={group.note.id} aria-label={title} className="mb-2">
          <h3 className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-medium text-[var(--text-secondary)]">
            <FileText size={12} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
            <span className="truncate" title={title}>{title}</span>
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.requests.map((req) => {
              const chosen = isChosen(group, req);
              return (
                <li key={`${req.blockIndex}:${req.requestIndex}`}>
                  <button
                    type="button"
                    onClick={() => onChoose(group, req)}
                    aria-current={chosen ? 'true' : undefined}
                    title={`${req.method} ${req.url}`}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${FOCUS_RING} ${
                      chosen ? 'bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-[var(--text-hint)]">{req.method}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{req.name ?? shortUrl(req.url)}</span>
                      {req.name && <span className="truncate font-mono text-[10px] text-[var(--text-hint)]">{shortUrl(req.url)}</span>}
                    </span>
                    {req.hasErrors && (
                      <>
                        <CircleAlert size={12} className="shrink-0 text-red-400" aria-hidden />
                        <span className="sr-only">{tr('requestHasErrors')}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      );
    });
  }

  return (
    <aside
      aria-labelledby="http-requests-title"
      className="flex max-h-[40vh] w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--bg-panel)] @2xl/httpview:max-h-none @2xl/httpview:w-[260px] @2xl/httpview:border-b-0 @2xl/httpview:border-r"
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 id="http-requests-title" className={PANEL_TITLE}>
          {tr('viewRequests')}
          {groups && total > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal">· {tr('viewCount', { n: total })}</span>}
        </h2>
        <button type="button" onClick={onRefresh} aria-label={tr('viewRefresh')} title={tr('viewRefresh')} className={ICON_BTN}>
          <RotateCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <button type="button" onClick={onNew} className={`${SECONDARY_CLS} justify-center`}>
          <Plus size={13} aria-hidden />
          {tr('viewNew')}
        </button>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-hint)]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label={tr('viewSearch')}
            placeholder={tr('viewSearch')}
            className={`${INPUT_CLS} w-full pl-7`}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
      <nav aria-label={tr('viewRequestsAria')} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {content}
      </nav>
    </aside>
  );
}
