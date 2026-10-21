import { useEffect, useRef, useState } from 'react';
import { adoptServer, commitDraft, editDraft, hydrateDrafts, type FieldDrafts, type FieldValues } from '../lib/fieldDrafts';

// Envuelve src/lib/fieldDrafts.ts para un formulario. Puerto de
// logday-web/src/hooks/useFieldDrafts.ts. `recordKey` es el id del registro
// abierto: al cambiar, el formulario se rehidrata entero. `server` son los
// valores del store ya pasados a string, como los muestra el formulario
// (null mientras no hay registro).
export function useFieldDrafts<T extends FieldValues>(recordKey: string | null, server: T | null) {
  const [drafts, setDrafts] = useState<FieldDrafts<T> | null>(() => (server ? hydrateDrafts(server) : null));
  const draftsRef = useRef(drafts);
  const keyRef = useRef(recordKey);
  const serverSig = server ? JSON.stringify(server) : null;

  const update = (next: FieldDrafts<T> | null) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  useEffect(() => {
    if (!server) return;
    const current = draftsRef.current;
    update(!current || keyRef.current !== recordKey ? hydrateDrafts(server) : adoptServer(current, server));
    keyRef.current = recordKey;
    // serverSig resume `server`: depender del objeto lo correría en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey, serverSig]);

  const edit = (field: keyof T, value: string) => {
    const current = draftsRef.current;
    if (current) update(editDraft(current, field, value));
  };

  // Devuelve el valor a mandar, o null si no hay nada que mandar.
  const commit = (field: keyof T): string | null => {
    const current = draftsRef.current;
    if (!current) return null;
    const { next, send, value } = commitDraft(current, field);
    if (next !== current) update(next);
    return send ? value : null;
  };

  // Mientras el registro abierto cambia, `drafts` puede ser todavía el del
  // anterior: no mostrarlo.
  const values = drafts && keyRef.current === recordKey ? drafts.values : server;
  return { values, edit, commit };
}
