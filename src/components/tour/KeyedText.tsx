// Un texto del recorrido con sus teclas como `<kbd>`, con el mismo aspecto
// que la de SearchModal (specs/onboarding design, Teclas).
import { Fragment } from 'react';
import { splitKeys } from './scenes';

export const KBD_CLS = 'rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--text-hint)]';

export function KeyedText({ text, keys }: { text: string; keys?: Record<string, string> }) {
  return (
    <>
      {splitKeys(text, keys).map((part, i) =>
        part.key ? <kbd key={i} className={KBD_CLS}>{part.text}</kbd> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}
