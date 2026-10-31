// Un texto del recorrido con sus teclas como `<kbd>`, con el mismo aspecto
// que la de SearchModal (specs/onboarding design, Teclas). Lo usa también la
// ayuda contextual (specs/ayuda-contextual).
import { Fragment } from 'react';
import { splitKeys } from './scenes';
import { KBD } from '../shared/controlClasses';

export function KeyedText({ text, keys }: { text: string; keys?: Record<string, string> }) {
  return (
    <>
      {splitKeys(text, keys).map((part, i) =>
        part.key ? <kbd key={i} className={KBD}>{part.text}</kbd> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}
