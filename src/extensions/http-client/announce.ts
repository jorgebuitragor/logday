// Una sola región viva para toda la extensión (specs/cliente-http,
// Interfaz §6): la crea `start()` y la quita su parada. No hay una por
// bloque, para que dos bloques no hablen a la vez.

let region: HTMLElement | null = null;

export function mountAnnouncer(): () => void {
  if (typeof document === 'undefined') return () => {};
  const el = document.createElement('div');
  el.className = 'sr-only';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.dataset.httpClientAnnouncer = '';
  document.body.appendChild(el);
  region = el;
  return () => {
    el.remove();
    if (region === el) region = null;
  };
}

/** Lo vacía y lo vuelve a escribir, para que se lea aunque se repita. */
export function announce(message: string): void {
  const el = region;
  if (!el) return;
  el.textContent = '';
  setTimeout(() => {
    el.textContent = message;
  }, 30);
}
