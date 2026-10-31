// "Copiar como…" y el panel "Código" (specs/cliente-http HT60 y HT61): el
// menú de la barra del bloque y de la pantalla, y el panel con el código de
// la petición en cada lenguaje. El código sale de `core/codegen.ts`, sobre
// el texto sin resolver: las variables y los secretos quedan como
// {{nombre}}.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Copy, SquareTerminal } from 'lucide-react';
import { ICON_BTN, PANEL_TITLE } from '../../../components/shared/controlClasses';
import { CodeText } from '../../devtools/ui/highlight';
import { announce } from '../announce';
import { CODE_LANGUAGES, codegenBlocked, generateCode, type CodeLanguage, type CodeLanguageInfo, type CodegenBlock } from '../core/codegen';
import type { ParsedRequest } from '../core/parse';
import type { Tr } from '../core/text';
import { Menu, type MenuItem } from './Menu';
import { PRE, SEG_BTN } from './ResponseView';

/** La marca de "copiado" (`Check`) dura 1,5 s. */
function useFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return [on, () => setOn(true)];
}

const blockText = (tr: Tr, block: CodegenBlock) => (block === 'java_multipart' ? tr('codegenJavaMultipart') : '');

/** Copia el código y lo anuncia ("Copiado como Python (requests)"). */
async function copyCode(tr: Tr, lang: CodeLanguageInfo, req: ParsedRequest): Promise<boolean> {
  const code = generateCode(lang.id, req);
  if (code === null) return false;
  try {
    await navigator.clipboard.writeText(code);
    announce(tr('aCopiedAs', { lang: lang.label }));
    return true;
  } catch {
    // Sin permiso del portapapeles: no hay nada más que hacer.
    return false;
  }
}

/** Las opciones del menú: un lenguaje por fila; Java con multipart,
 *  deshabilitado con la razón debajo (decisión 7). */
export function copyAsItems(tr: Tr, req: ParsedRequest | null, onPick: (lang: CodeLanguageInfo) => void): MenuItem[] {
  return CODE_LANGUAGES.map((lang) => {
    const block = req ? codegenBlocked(lang.id, req) : null;
    return {
      key: lang.id,
      action: true,
      label: lang.label,
      disabled: !!block,
      description: block ? blockText(tr, block) : undefined,
      onSelect: () => onPick(lang),
    };
  });
}

/** El menú "Copiar como…". Con `req` en `null` (errores de sintaxis),
 *  queda deshabilitado. */
export function CopyAsMenu({ tr, req, withLabel = false }: {
  tr: Tr;
  req: ParsedRequest | null;
  /** El texto junto al ícono, desde `@sm/tool` (la pantalla). */
  withLabel?: boolean;
}) {
  const [copied, flash] = useFlash();
  return (
    <Menu
      label={tr('copyAs')}
      title={tr('copyAs')}
      hint={tr('copyAsHint')}
      disabled={!req}
      align="right"
      buttonClassName={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
      listClassName="min-w-[200px] max-w-[22rem]"
      items={copyAsItems(tr, req, (lang) => {
        if (req) void copyCode(tr, lang, req).then((ok) => ok && flash());
      })}
      button={
        <>
          {copied ? <Check size={14} className="text-emerald-400" aria-hidden /> : <SquareTerminal size={14} aria-hidden />}
          {withLabel && <span className="hidden @sm/tool:inline">{tr('copyAs')}</span>}
          <ChevronDown size={11} className="shrink-0" aria-hidden />
        </>
      }
    />
  );
}

/** El panel "Código" de la pantalla: las pestañas de lenguaje, el código
 *  resaltado y "Copiar". Se actualiza con la petición. */
export function CodePanel({ tr, req, id }: {
  tr: Tr;
  /** `null` si la petición no tiene URL o tiene errores. */
  req: ParsedRequest | null;
  id?: string;
}) {
  const [lang, setLang] = useState<CodeLanguage>('curl');
  const [copied, flash] = useFlash();
  const tabRefs = useRef<Partial<Record<CodeLanguage, HTMLButtonElement | null>>>({});
  const uid = useId().replace(/:/g, '');
  const titleId = `http-code-title-${uid}`;
  const panelId = `http-code-panel-${uid}`;
  const info = CODE_LANGUAGES.find((l) => l.id === lang) ?? CODE_LANGUAGES[0];
  const block = req ? codegenBlocked(lang, req) : null;
  const code = req ? generateCode(lang, req) : null;

  // ←/→ y Home/End entre los lenguajes, con el foco en el elegido.
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = CODE_LANGUAGES.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setLang(CODE_LANGUAGES[to].id);
    tabRefs.current[CODE_LANGUAGES[to].id]?.focus();
  };

  return (
    <section id={id} aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className={PANEL_TITLE}>{tr('codePanel')}</h3>
        <div role="tablist" aria-label={tr('codeLanguages')} className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          {CODE_LANGUAGES.map((l, i) => (
            <button
              key={l.id}
              ref={(el) => {
                tabRefs.current[l.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={l.id === lang}
              aria-controls={panelId}
              tabIndex={l.id === lang ? 0 : -1}
              onClick={() => setLang(l.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={SEG_BTN(l.id === lang)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (req) void copyCode(tr, info, req).then((ok) => ok && flash());
          }}
          disabled={code === null}
          aria-label={tr('codeCopy')}
          title={tr('codeCopy')}
          className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
        >
          {copied ? <Check size={14} className="text-emerald-400" aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      </div>
      <div role="tabpanel" id={panelId} aria-label={info.label} className="flex min-w-0 flex-col gap-1.5">
        {code !== null ? (
          <>
            <p className="text-[10px] text-[var(--text-hint)]">{tr('copyAsHint')}</p>
            <pre tabIndex={0} aria-label={tr('codeAria', { lang: info.label })} className={`${PRE} whitespace-pre`}>
              <CodeText code={code} language={info.highlight} />
            </pre>
          </>
        ) : (
          <p className="flex min-h-[4rem] items-center justify-center rounded-lg border border-dashed border-[var(--border-card)] p-3 text-center text-xs text-[var(--text-hint)]">
            {block ? blockText(tr, block) : tr('codeNotReady')}
          </p>
        )}
      </div>
    </section>
  );
}
