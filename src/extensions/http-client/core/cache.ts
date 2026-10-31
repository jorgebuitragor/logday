// Respuestas en memoria, por bloque y por petición (specs/cliente-http
// HT11, design A8). Nunca van a disco, a `localStorage` ni a la
// configuración: se pierden al desactivar la extensión o al cerrar Logday.

export const MAX_ENTRIES = 30;
export const MAX_BYTES = 50 * 1024 * 1024;

export interface CacheEntry<T> {
  /** El texto de la sección cuando se envió. */
  source: string;
  /** Método y URL sin resolver: si cambia, es otra petición. */
  firstLine: string;
  value: T;
  /** Lo que ocupa, para el tope total. */
  bytes: number;
  at: number;
}

/** `${noteId}#${blockIndex}#${requestIndex}`; el formulario de la pantalla
 *  usa `view:<nota>:<bloque>:<petición>#0#0` o `view:new#0#0`. */
export const cacheKey = (noteId: string, blockIndex: number, requestIndex: number) => `${noteId}#${blockIndex}#${requestIndex}`;

export interface CacheHit<T> {
  entry: CacheEntry<T>;
  /** La petición cambió después de esta respuesta. */
  stale: boolean;
}

export class ResponseCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private total = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get size() {
    return this.map.size;
  }

  get bytes() {
    return this.total;
  }

  /** La respuesta de esa petición, si sigue siendo de ella. Leerla la
   *  marca como reciente. */
  get(key: string, firstLine: string, source: string): CacheHit<T> | null {
    const entry = this.map.get(key);
    if (!entry || entry.firstLine !== firstLine) return null;
    this.map.delete(key);
    this.map.set(key, entry);
    return { entry, stale: entry.source !== source };
  }

  /** La última respuesta de esa clave, sea de la petición que sea, sin
   *  marcarla como reciente. La usa el formulario, que tiene una sola petición:
   *  al cambiar la URL, la respuesta anterior se sigue viendo como vieja. */
  peek(key: string): CacheEntry<T> | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, entry: CacheEntry<T>): void {
    this.delete(key);
    this.map.set(key, entry);
    this.total += entry.bytes;
    // Se olvidan las más viejas. La recién llegada se queda aunque sola
    // pase del tope: si no, el usuario no vería la respuesta que pidió.
    for (const [k, e] of this.map) {
      if (k === key || (this.map.size <= this.maxEntries && this.total <= this.maxBytes)) break;
      this.map.delete(k);
      this.total -= e.bytes;
    }
  }

  delete(key: string): void {
    const prev = this.map.get(key);
    if (!prev) return;
    this.map.delete(key);
    this.total -= prev.bytes;
  }

  clear(): void {
    this.map.clear();
    this.total = 0;
  }
}
