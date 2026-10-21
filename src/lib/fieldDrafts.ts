// Borradores de un formulario de campos sueltos que se guardan por campo
// (detalle de task). Puerto de logday-web/src/lib/fieldDrafts.ts
// (jorgebuitragor/logday-web#10), sin cambios de lógica.
//
// El problema que resuelve: el formulario se hidrataba solo al cambiar de
// registro. Si otro cliente cambiaba un campo mientras el formulario
// estaba abierto, lo local quedaba viejo, y al editar ese campo se
// escribía sobre el valor viejo y se pisaba la edición remota.
//
// Reglas:
// - Un campo que el usuario no tocó adopta el valor del servidor cuando
//   ese campo cambia en el servidor (no cuando cambia otro).
// - Un campo editado y sin confirmar conserva lo escrito.
// - Al confirmar solo se manda si el usuario lo editó y el valor es
//   distinto del último que dio el servidor.
// Tras confirmar, el campo muestra lo que se mandó hasta que el store lo
// devuelve, y lo adopta.

export type FieldValues = Record<string, string>;

export interface FieldDrafts<T extends FieldValues> {
  values: T;
  dirty: ReadonlySet<keyof T>;
  lastServer: T;
}

export function hydrateDrafts<T extends FieldValues>(server: T): FieldDrafts<T> {
  return { values: { ...server }, dirty: new Set(), lastServer: { ...server } };
}

export function adoptServer<T extends FieldValues>(d: FieldDrafts<T>, server: T): FieldDrafts<T> {
  let values = d.values;
  for (const field of Object.keys(server) as (keyof T)[]) {
    if (server[field] === d.lastServer[field] || d.dirty.has(field)) continue;
    if (values === d.values) values = { ...d.values };
    values[field] = server[field];
  }
  return { values, dirty: d.dirty, lastServer: { ...server } };
}

export function editDraft<T extends FieldValues>(d: FieldDrafts<T>, field: keyof T, value: string): FieldDrafts<T> {
  const dirty = new Set(d.dirty);
  dirty.add(field);
  return { values: { ...d.values, [field]: value }, dirty, lastServer: d.lastServer };
}

export function commitDraft<T extends FieldValues>(
  d: FieldDrafts<T>,
  field: keyof T,
): { next: FieldDrafts<T>; send: boolean; value: string } {
  const value = d.values[field];
  if (!d.dirty.has(field)) return { next: d, send: false, value };
  const dirty = new Set(d.dirty);
  dirty.delete(field);
  return { next: { ...d, dirty }, send: value !== d.lastServer[field], value };
}
