// JSON, YAML y XML (specs/devtools D1, design §4 "Formatos").
import { useDevtools } from '../ui/context';
import { Option, Segmented } from '../ui/controls';
import { useToolOptions } from '../ui/hooks';
import { fromResult, TextTool, validWithSize, type TextComputed } from '../ui/TextTool';
import { toolKey } from '../ui/text';
import { formatJson, formatXml, formatYaml, minifyJson, minifyXml, type Indent } from '../tools/formats';

const indentOf = (v: string): Indent => (v === '4' ? 4 : v === 'tab' ? 'tab' : 2);

/** Números de más de 15 cifras: `JSON.parse` los redondea. */
const BIG_NUMBER = /(?:^|[[:,\s])-?\d{16,}(?:\.\d+)?(?:[eE][+-]?\d+)?\s*(?=[,\]}\s]|$)/;

function useIndentOptions(withTab: boolean) {
  const { tr } = useDevtools();
  return [
    { value: '2', label: tr('indent2') },
    { value: '4', label: tr('indent4') },
    ...(withTab ? [{ value: 'tab', label: tr('indentTab') }] : []),
  ];
}

const JSON_DEFAULTS = { mode: 'format', indent: '2' };
const JSON_ALLOWED = { mode: ['format', 'minify'], indent: ['2', '4', 'tab'] } as const;
const JSON_EXAMPLE =
  '{"proyecto":"Logday","versión":2,"etiquetas":["sync","notas"],"activo":true,"dueño":{"nombre":"Ana Pérez","id":1001},"vence":null}';

export function JsonTool() {
  const { tr, language } = useDevtools();
  const [opts, setOpts] = useToolOptions('json', JSON_DEFAULTS, JSON_ALLOWED);
  const indents = useIndentOptions(true);
  const compute = (input: string): TextComputed => {
    // Un BOM al principio (archivos de Windows) no es parte del JSON.
    const bom = input.charCodeAt(0) === 0xfeff;
    const text = bom ? input.slice(1) : input;
    const r = opts.mode === 'minify' ? minifyJson(text) : formatJson(text, indentOf(opts.indent));
    const warnings = [...(bom ? [tr('bomRemoved')] : []), ...(r.ok && BIG_NUMBER.test(text) ? [tr('bigNumber')] : [])];
    return fromResult(r, { valid: validWithSize(tr, 'JSON', text, language), warnings });
  };
  return (
    <TextTool
      depsKey={`${opts.mode}|${opts.indent}`}
      compute={compute}
      placeholder={tr(toolKey('json', 'placeholder'))}
      example={JSON_EXAMPLE}
      language="json"
      noteLanguage="json"
      options={
        <>
          <Option label={tr('mode')}>
            <Segmented
              label={tr('mode')}
              value={opts.mode}
              onChange={(mode) => setOpts({ mode })}
              options={[{ value: 'format', label: tr('modeFormat') }, { value: 'minify', label: tr('modeMinify') }]}
            />
          </Option>
          <Option label={tr('indent')}>
            <Segmented label={tr('indent')} value={opts.indent} disabled={opts.mode === 'minify'} onChange={(indent) => setOpts({ indent })} options={indents} />
          </Option>
        </>
      }
    />
  );
}

const YAML_DEFAULTS = { indent: '2' };
const YAML_ALLOWED = { indent: ['2', '4'] } as const;
const YAML_EXAMPLE = 'servidor:\n  nombre: logday   # el del equipo\n  puerto: 8080\n  rutas: [/app, /api]\nusuarios:\n  - nombre: Ana\n    rol: admin\n  - nombre: Luis\n    rol: lector\n';
/** Un `#` que empieza un comentario (al inicio o después de un espacio). */
const YAML_COMMENT = /(^|\s)#/m;

export function YamlTool() {
  const { tr, language } = useDevtools();
  const [opts, setOpts] = useToolOptions('yaml', YAML_DEFAULTS, YAML_ALLOWED);
  const indents = useIndentOptions(false);
  const compute = (input: string): TextComputed =>
    fromResult(formatYaml(input, indentOf(opts.indent)), {
      valid: validWithSize(tr, 'YAML', input, language),
      warnings: YAML_COMMENT.test(input) ? [tr('yamlCommentsLost')] : [],
    });
  return (
    <TextTool
      depsKey={opts.indent}
      compute={compute}
      placeholder={tr(toolKey('yaml', 'placeholder'))}
      example={YAML_EXAMPLE}
      language="yaml"
      noteLanguage="yaml"
      options={
        <Option label={tr('indent')}>
          <Segmented label={tr('indent')} value={opts.indent} onChange={(indent) => setOpts({ indent })} options={indents} />
        </Option>
      }
    />
  );
}

const XML_DEFAULTS = { mode: 'format', indent: '2' };
const XML_ALLOWED = JSON_ALLOWED;
const XML_EXAMPLE =
  '<?xml version="1.0" encoding="UTF-8"?><pedido id="1001" fecha="2026-10-30"><cliente>Ana Pérez</cliente><items><item sku="A-1" cantidad="2">Cuaderno</item><item sku="B-7" cantidad="1">Lápiz</item></items><!-- sin descuento --></pedido>';

export function XmlTool() {
  const { tr, language } = useDevtools();
  const [opts, setOpts] = useToolOptions('xml', XML_DEFAULTS, XML_ALLOWED);
  const indents = useIndentOptions(true);
  const compute = (input: string): TextComputed => {
    const r = opts.mode === 'minify' ? minifyXml(input) : formatXml(input, indentOf(opts.indent));
    return fromResult(r, { valid: validWithSize(tr, 'XML', input, language) });
  };
  return (
    <TextTool
      depsKey={`${opts.mode}|${opts.indent}`}
      compute={compute}
      placeholder={tr(toolKey('xml', 'placeholder'))}
      example={XML_EXAMPLE}
      language="xml"
      noteLanguage="xml"
      options={
        <>
          <Option label={tr('mode')}>
            <Segmented
              label={tr('mode')}
              value={opts.mode}
              onChange={(mode) => setOpts({ mode })}
              options={[{ value: 'format', label: tr('modeFormat') }, { value: 'minify', label: tr('modeMinify') }]}
            />
          </Option>
          <Option label={tr('indent')}>
            <Segmented label={tr('indent')} value={opts.indent} disabled={opts.mode === 'minify'} onChange={(indent) => setOpts({ indent })} options={indents} />
          </Option>
        </>
      }
    />
  );
}
