// Corre el regex en un worker con tiempo límite (specs/devtools D5). Cada
// prueba usa un worker nuevo: si se pasa del tiempo, se termina y la app
// sigue respondiendo.
import type { ToolResult } from './result';
import type { RegexRun } from './regex';

export const REGEX_TIMEOUT_MS = 1000;

export type RegexOutcome = ToolResult<RegexRun> | { ok: false; timeout: true };

let current: Worker | null = null;

export function runRegexInWorker(pattern: string, flags: string, text: string): Promise<RegexOutcome> {
  // Una prueba nueva cancela la anterior (se escribe letra por letra).
  current?.terminate();
  const worker = new Worker(new URL('./regexWorker.ts', import.meta.url), { type: 'module' });
  current = worker;
  return new Promise((resolve) => {
    const done = (outcome: RegexOutcome) => {
      clearTimeout(timer);
      worker.terminate();
      if (current === worker) current = null;
      resolve(outcome);
    };
    const timer = setTimeout(() => done({ ok: false, timeout: true }), REGEX_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<ToolResult<RegexRun>>) => done(e.data);
    worker.onerror = () => done({ ok: false, error: { code: 'regex-invalid' } });
    worker.postMessage({ pattern, flags, text });
  });
}

export function cancelRegex() {
  current?.terminate();
  current = null;
}
