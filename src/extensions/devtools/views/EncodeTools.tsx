// Base64, URL y entidades HTML (specs/devtools D2): comparten plantilla,
// con la dirección y el botón de intercambiar.
import type { ToolId } from '../model';
import type { DevtoolsKey } from '../../../lib/i18n';
import { useDevtools } from '../ui/context';
import { Option, Segmented, Toggle } from '../ui/controls';
import { useToolOptions } from '../ui/hooks';
import { fromResult, TextTool, type TextComputed } from '../ui/TextTool';
import { ok } from '../tools/result';
import {
  base64Decode, base64Encode, base64InvalidAt, htmlDecode, htmlEncode, urlDecode, urlEncode, urlInvalidAt,
} from '../tools/encoding';

type Direction = 'encode' | 'decode';
const DEFAULTS: { direction: string; flag: boolean } = { direction: 'encode', flag: false };
const ALLOWED = { direction: ['encode', 'decode'] } as const;

function EncodeTool({
  tool, flag, compute, examples,
}: {
  tool: ToolId;
  /** El interruptor propio (base64url, no ASCII), si lo tiene. */
  flag?: DevtoolsKey;
  compute: (input: string, direction: Direction, flag: boolean) => TextComputed;
  examples: Record<Direction, string>;
}) {
  const { tr } = useDevtools();
  const [opts, setOpts] = useToolOptions(tool, DEFAULTS, ALLOWED);
  const direction = opts.direction as Direction;
  const encoding = direction === 'encode';
  return (
    <TextTool
      depsKey={`${opts.direction}|${opts.flag}`}
      compute={(input) => compute(input, direction, opts.flag)}
      placeholder={tr(`${tool}.placeholder${encoding ? 'Encode' : 'Decode'}` as DevtoolsKey)}
      example={examples[direction]}
      inputLabel={encoding ? tr('paneText') : tr('paneEncoded')}
      outputLabel={encoding ? tr('paneEncoded') : tr('paneText')}
      noteLanguage="plaintext"
      wrap
      swap={{ flip: () => setOpts({ direction: encoding ? 'decode' : 'encode' }) }}
      options={
        <>
          <Option label={tr('direction')}>
            <Segmented
              label={tr('direction')}
              value={opts.direction}
              onChange={(d) => setOpts({ direction: d })}
              options={[{ value: 'encode', label: tr('encode') }, { value: 'decode', label: tr('decode') }]}
            />
          </Option>
          {flag && encoding && <Toggle label={tr(flag)} checked={opts.flag} onChange={(v) => setOpts({ flag: v })} />}
        </>
      }
    />
  );
}

export function Base64Tool() {
  const { tr } = useDevtools();
  return (
    <EncodeTool
      tool="base64"
      flag="base64UrlSafe"
      examples={{ encode: 'Hola, Logday ✓ — año 2026', decode: 'SG9sYSwgTG9nZGF5IOKckyDigJQgYcOxbyAyMDI2' }}
      compute={(input, direction, urlSafe) => {
        if (direction === 'encode') return fromResult(ok(base64Encode(input, urlSafe)));
        const r = base64Decode(input);
        if (r.ok) return fromResult(r);
        // Al decodificar se aceptan las dos variantes: no hace falta elegir.
        const bad = base64InvalidAt(input);
        const message = r.error.detail === 'not UTF-8 text'
          ? tr('base64NotText')
          : bad ? tr('base64Invalid', { char: bad.char, pos: bad.pos }) : undefined;
        return { ok: false, error: r.error, message };
      }}
    />
  );
}

export function UrlTool() {
  const { tr } = useDevtools();
  return (
    <EncodeTool
      tool="url"
      examples={{ encode: 'nombre=José Pérez&ciudad=Bogotá D.C.', decode: 'nombre%3DJos%C3%A9%20P%C3%A9rez%26ciudad%3DBogot%C3%A1+D.C.' }}
      compute={(input, direction) => {
        if (direction === 'encode') return fromResult(ok(urlEncode(input)));
        const r = urlDecode(input);
        if (r.ok) return fromResult(r);
        const pos = urlInvalidAt(input);
        return { ok: false, error: r.error, message: pos ? tr('urlInvalid', { pos }) : undefined };
      }}
    />
  );
}

export function HtmlTool() {
  return (
    <EncodeTool
      tool="html"
      flag="htmlAll"
      examples={{ encode: '<a href="/notas?id=1&orden=desc">Ver «notas» de café</a>', decode: '&lt;b&gt;Caf&eacute; &amp; t&#233;&lt;/b&gt; &#128640;' }}
      compute={(input, direction, all) => fromResult(ok(direction === 'encode' ? htmlEncode(input, all) : htmlDecode(input)))}
    />
  );
}
