// Convertir: JSON ↔ YAML y JSON → CSV (specs/devtools D1, Adenda A).
import { useDevtools } from '../ui/context';
import { Option, Segmented, Toggle } from '../ui/controls';
import { useToolOptions } from '../ui/hooks';
import { fromResult, TextTool, type TextComputed } from '../ui/TextTool';
import { toolKey } from '../ui/text';
import { jsonToCsvTable, jsonToYaml, yamlToJson, type CsvSeparator } from '../tools/formats';

const DEFAULTS = { conversion: 'json-yaml', indent: '2', separator: 'comma', headers: true };
const ALLOWED = {
  conversion: ['json-yaml', 'yaml-json', 'json-csv'],
  indent: ['2', '4'],
  separator: ['comma', 'semicolon', 'tab'],
} as const;
const SEPARATOR: Record<string, CsvSeparator> = { comma: ',', semicolon: ';', tab: '\t' };

const EXAMPLES: Record<string, string> = {
  'json-yaml': '{"app":"Logday","puerto":8080,"etiquetas":["sync","notas"],"dueño":{"nombre":"Ana"}}',
  'yaml-json': 'app: Logday\npuerto: 8080\netiquetas:\n  - sync\n  - notas\ndueño:\n  nombre: Ana\n',
  'json-csv': '[{"id": 1, "nombre": "Ana", "ciudad": "Bogotá"}, {"id": 2, "nombre": "Luis", "correo": "luis@ejemplo.com"}]',
};

export default function ConvertTool() {
  const { tr } = useDevtools();
  const [opts, setOpts] = useToolOptions('convert', DEFAULTS, ALLOWED);
  const csv = opts.conversion === 'json-csv';
  const compute = (input: string): TextComputed => {
    const indent = opts.indent === '4' ? 4 : 2;
    if (opts.conversion === 'yaml-json') return fromResult(yamlToJson(input, indent));
    if (opts.conversion === 'json-yaml') return fromResult(jsonToYaml(input, indent));
    const table = jsonToCsvTable(input, { separator: SEPARATOR[opts.separator], headers: opts.headers });
    if (!table.ok) return { ok: false, error: table.error };
    return { ok: true, value: table.value.csv, summary: tr('csvSummary', { rows: table.value.rows, cols: table.value.columns }) };
  };
  return (
    <TextTool
      depsKey={`${opts.conversion}|${opts.indent}|${opts.separator}|${opts.headers}`}
      compute={compute}
      placeholder={tr(toolKey('convert', 'placeholder'))}
      example={EXAMPLES[opts.conversion]}
      language={opts.conversion === 'json-yaml' ? 'yaml' : opts.conversion === 'yaml-json' ? 'json' : null}
      noteLanguage={opts.conversion === 'json-yaml' ? 'yaml' : opts.conversion === 'yaml-json' ? 'json' : 'csv'}
      swap={{
        flip: () => setOpts({ conversion: opts.conversion === 'json-yaml' ? 'yaml-json' : 'json-yaml' }),
        disabled: csv,
        disabledTitle: tr('csvToJsonUnavailable'),
      }}
      options={
        <>
          <Option label={tr('conversion')}>
            <Segmented
              label={tr('conversion')}
              value={opts.conversion}
              onChange={(conversion) => setOpts({ conversion })}
              options={[
                { value: 'json-yaml', label: tr('jsonToYaml') },
                { value: 'yaml-json', label: tr('yamlToJson') },
                { value: 'json-csv', label: tr('jsonToCsv') },
              ]}
            />
          </Option>
          {csv ? (
            <>
              <Option label={tr('csvSeparator')}>
                <Segmented
                  label={tr('csvSeparator')}
                  value={opts.separator}
                  onChange={(separator) => setOpts({ separator })}
                  options={[
                    { value: 'comma', label: tr('sepComma') },
                    { value: 'semicolon', label: tr('sepSemicolon') },
                    { value: 'tab', label: tr('sepTab') },
                  ]}
                />
              </Option>
              <Toggle label={tr('csvHeaders')} checked={opts.headers} onChange={(headers) => setOpts({ headers })} />
            </>
          ) : (
            <Option label={tr('indent')}>
              <Segmented
                label={tr('indent')}
                value={opts.indent}
                onChange={(indent) => setOpts({ indent })}
                options={[{ value: '2', label: tr('indent2') }, { value: '4', label: tr('indent4') }]}
              />
            </Option>
          )}
        </>
      }
    />
  );
}
