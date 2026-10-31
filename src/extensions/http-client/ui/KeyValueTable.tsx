// La tabla editable de Params y Cabeceras (specs/cliente-http HT41, HT42,
// design §14.4 y §14.11). Es una vista del texto de la petición: cada
// cambio llama a una función de `requestEdit.ts` que reescribe solo las
// líneas de su fila. Genérica (nombre, valor y casilla), para que Form de
// A2 y las variables de Opciones puedan usarla después.
//
// No es un `grid` ARIA: en un formulario ese patrón confunde al lector de
// pantalla. Tab recorre casilla → nombre → valor → eliminar, fila a fila.
import { useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { CircleAlert, KeyRound, Plus, Trash2 } from 'lucide-react';
import { CHIP, FOCUS_RING, ICON_BTN, INPUT_CLS, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { StatusItem } from '../../../components/shared/FormControls';
import { NO_AUTOCORRECT } from '../../devtools/ui/classes';
import type { Tr } from '../core/text';
import { announce } from '../announce';
import { TEXT_LINK } from './SendStatus';

export interface KVRow {
  name: string;
  value: string;
  enabled: boolean;
  /** "en una línea aparte" (un parámetro de una línea `&`). */
  ownLine?: boolean;
  /** La escribió Auth (HT43): lleva la llave. */
  fromAuth?: boolean;
}

/** Un campo que, mientras tiene el foco, muestra lo que se escribe: el
 *  texto de la petición lo normaliza (quita espacios del final, codifica
 *  la query) y, si se mostrara eso al instante, el cursor saltaría o un
 *  espacio desaparecería al escribirlo. Al salir, muestra el texto. */
export function LiveInput({
  value, onValue, invalid, inputRef, ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValue: (value: string) => void;
  invalid?: (value: string) => boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [local, setLocal] = useState<string | null>(null);
  const shown = local ?? value;
  const bad = invalid?.(shown) ?? false;
  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      value={shown}
      aria-invalid={bad || undefined}
      onFocus={(e) => {
        setLocal(value);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setLocal(null);
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        setLocal(e.target.value);
        onValue(e.target.value);
      }}
      {...NO_AUTOCORRECT}
    />
  );
}

const CELL_INPUT = `${INPUT_CLS} w-full min-w-0 font-mono`;

export function KeyValueTable({
  tr, caption, rows, readOnly, onGoToText, addLabel, emptyText, autoRows = [],
  onToggle, onEdit, onAdd, onRemove, onMove, validName = (n) => n.trim() !== '', invalidNameText,
}: {
  tr: Tr;
  caption: string;
  rows: KVRow[];
  /** Con un error de sintaxis en la zona (HT40): la tabla no se edita. */
  readOnly?: string | null;
  onGoToText: () => void;
  addLabel: string;
  emptyText: string;
  /** Las que agrega Logday, en solo lectura (HT42). */
  autoRows?: { name: string; value: string }[];
  onToggle: (index: number) => void;
  onEdit: (index: number, row: { name: string; value: string }) => void;
  onAdd: (row: { name: string; value: string }) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  /** Un nombre que se puede escribir en el texto (una cabecera no lleva espacios). */
  validName?: (name: string) => boolean;
  invalidNameText?: string;
}) {
  // La fila nueva vive aquí hasta que tiene un nombre válido: una fila sin
  // nombre no se puede escribir en el texto (`: valor` sería un error).
  const [adding, setAdding] = useState<{ name: string; value: string } | null>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [focusNext, setFocusNext] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  // El foco que pidió la última acción (agregar, quitar, mover), cuando ya
  // se dibujaron las filas nuevas.
  useEffect(() => {
    if (!focusNext) return;
    const el = focusNext === 'add' ? addRef.current : refs.current[focusNext];
    el?.focus();
    setFocusNext(null);
  }, [focusNext]);

  // Lo que pasa con cada fila se anuncia sin mover el foco (§14.11).
  const say = announce;

  const startAdding = () => {
    setAdding({ name: '', value: '' });
    setFocusNext(`${rows.length}:name`);
  };

  const commitNew = (next: { name: string; value: string }) => {
    if (!validName(next.name)) {
      setAdding(next);
      return;
    }
    onAdd(next);
    // La fila ya es del texto: con la misma clave, el campo no pierde el foco.
    setAdding(null);
  };

  const rowKeyDown = (e: KeyboardEvent, index: number, field: string, isLast: boolean) => {
    if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      if (index + delta < 0 || index + delta >= rows.length) return;
      e.preventDefault();
      onMove(index, delta);
      say(tr('rowMovedA', { name: rows[index].name, n: index + delta + 1 }));
      setFocusNext(`${index + delta}:${field}`);
      return;
    }
    if (e.key === 'Enter' && field === 'value' && isLast && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      startAdding();
    }
  };

  const remove = (index: number) => {
    const name = rows[index].name;
    onRemove(index);
    say(tr('rowRemovedA', { name }));
    // El foco va a la fila siguiente o, si era la última, a "Agregar".
    setFocusNext(index < rows.length - 1 ? `${index}:delete` : 'add');
  };

  const shown: (KVRow & { draft?: boolean })[] = adding ? [...rows, { ...adding, enabled: true, draft: true }] : rows;

  return (
    <div className="flex flex-col gap-2">
      {readOnly && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusItem kind="error">{tr('tableReadOnly', { message: readOnly })}</StatusItem>
          <button type="button" className={TEXT_LINK} onClick={onGoToText}>{tr('goToText')}</button>
        </div>
      )}
      {shown.length === 0 && autoRows.length === 0 ? (
        <p className="text-[11px] text-[var(--text-hint)]">{emptyText}</p>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-y-1 text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{tr('colEnabled')}</th>
              <th scope="col">{tr('colName')}</th>
              <th scope="col">{tr('colValue')}</th>
              <th scope="col">{tr('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => {
              const isDraft = !!row.draft;
              const label = row.name || tr('rowNameAria', { n: i + 1 });
              const isLast = i === shown.length - 1;
              const dim = row.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-hint)]';
              return (
                <tr key={`r${i}`} className="align-middle">
                  <td className="w-7 p-0">
                    {/* La celda de 28 px también activa la casilla. */}
                    <label className="flex min-h-7 min-w-7 cursor-pointer items-center justify-center">
                      <input
                        ref={(el) => {
                          refs.current[`${i}:check`] = el;
                        }}
                        type="checkbox"
                        checked={row.enabled}
                        disabled={!!readOnly || isDraft}
                        aria-label={tr('rowEnable', { name: label })}
                        onChange={() => {
                          onToggle(i);
                          say(tr(row.enabled ? 'rowDisabledA' : 'rowEnabledA', { name: label }));
                        }}
                        onKeyDown={(e) => rowKeyDown(e, i, 'check', isLast)}
                        className={`h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed ${FOCUS_RING}`}
                      />
                    </label>
                  </td>
                  <td className="w-[38%] pr-1.5">
                    <div className="flex min-w-0 items-center gap-1">
                      {row.fromAuth && (
                        <>
                          <KeyRound size={11} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                          <span className="sr-only">{tr('rowFromAuth')}</span>
                        </>
                      )}
                      <LiveInput
                        inputRef={(el) => {
                          refs.current[`${i}:name`] = el;
                        }}
                        value={row.name}
                        readOnly={!!readOnly}
                        aria-label={isDraft ? tr('rowNewName') : tr('rowNameAria', { n: i + 1 })}
                        placeholder={tr('rowNamePlaceholder')}
                        invalid={(v) => v !== '' && !validName(v)}
                        title={invalidNameText}
                        onValue={(v) => {
                          if (isDraft) commitNew({ name: v, value: row.value });
                          else if (validName(v)) onEdit(i, { name: v, value: row.value });
                        }}
                        onKeyDown={(e) => rowKeyDown(e, i, 'name', isLast)}
                        className={`${CELL_INPUT} ${dim}`}
                      />
                    </div>
                  </td>
                  <td className="pr-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <LiveInput
                        inputRef={(el) => {
                          refs.current[`${i}:value`] = el;
                        }}
                        value={row.value}
                        readOnly={!!readOnly}
                        aria-label={isDraft ? tr('rowNewValue') : tr('rowValueAria', { name: label })}
                        placeholder={tr('rowValuePlaceholder')}
                        onValue={(v) => {
                          if (isDraft) commitNew({ name: row.name, value: v });
                          else onEdit(i, { name: row.name, value: v });
                        }}
                        onKeyDown={(e) => rowKeyDown(e, i, 'value', isLast)}
                        className={`${CELL_INPUT} ${dim}`}
                      />
                      {row.ownLine && <span className={`${CHIP} hidden shrink-0 whitespace-nowrap @lg/tool:inline`}>{tr('rowOwnLine')}</span>}
                    </div>
                  </td>
                  <td className="w-8 p-0">
                    <button
                      ref={(el) => {
                        refs.current[`${i}:delete`] = el;
                      }}
                      type="button"
                      disabled={!!readOnly}
                      aria-label={tr('rowDelete', { name: label })}
                      title={tr('rowDelete', { name: label })}
                      onClick={() => {
                        if (!isDraft) {
                          remove(i);
                          return;
                        }
                        setAdding(null);
                        setFocusNext('add');
                      }}
                      onKeyDown={(e) => rowKeyDown(e, i, 'delete', isLast)}
                      className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
            {autoRows.map((row) => (
              <tr key={`auto-${row.name}`} className="align-middle text-[var(--text-hint)]">
                <td className="w-7 p-0" />
                <td className="truncate px-3 font-mono" title={row.name}>{row.name}</td>
                <td className="truncate px-3 font-mono" title={row.value}>
                  {row.value} <span className="font-sans text-[10px]">· {tr('markAuto')}</span>
                </td>
                <td className="w-8 p-0" />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && adding.name !== '' && !validName(adding.name) && invalidNameText && (
        <p className="flex items-center gap-1 text-[10px] text-red-400">
          <CircleAlert size={10} aria-hidden />
          {invalidNameText}
        </p>
      )}
      {!readOnly && (
        <div>
          <button ref={addRef} type="button" onClick={startAdding} className={SECONDARY_CLS}>
            <Plus size={13} aria-hidden />
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}
