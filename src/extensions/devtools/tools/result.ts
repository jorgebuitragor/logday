// Resultado común de las herramientas de DevTools: o una salida, o un
// error con un código traducible y, si se conoce, dónde está (línea y
// columna desde 1). Los mensajes los arma la vista con i18n (D7).

export type ToolErrorCode =
  | 'json-unexpected-token'
  | 'json-unexpected-end'
  | 'json-bad-string'
  | 'json-bad-number'
  | 'json-trailing'
  | 'yaml-invalid'
  | 'xml-invalid'
  | 'csv-not-array'
  | 'csv-not-objects'
  | 'base64-invalid'
  | 'url-invalid'
  | 'jwt-parts'
  | 'jwt-part-invalid'
  | 'timestamp-invalid'
  | 'date-invalid'
  | 'cron-invalid'
  | 'regex-invalid'
  | 'qr-too-long'
  | 'barcode-invalid'
  | 'sql-unclosed-quote';

export interface ToolError {
  code: ToolErrorCode;
  line?: number;
  column?: number;
  /** Detalle técnico en inglés (de la librería o del motor), opcional. */
  detail?: string;
}

export type ToolResult<T = string> = { ok: true; value: T } | { ok: false; error: ToolError };

export const ok = <T>(value: T): ToolResult<T> => ({ ok: true, value });
export const fail = (code: ToolErrorCode, extra: Omit<ToolError, 'code'> = {}): ToolResult<never> => ({
  ok: false,
  error: { code, ...extra },
});

/** Línea y columna (desde 1) de un índice dentro del texto. */
export function lineColumnAt(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}
