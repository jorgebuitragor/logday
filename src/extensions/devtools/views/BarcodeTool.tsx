// Código de barras (specs/devtools D16, Adenda B.3). La validación previa
// (`checkBarcode`) da mensajes propios antes de llamar a JsBarcode.
import { useMemo, useRef } from 'react';
import { Barcode } from 'lucide-react';
import type { DevtoolsKey } from '../../../lib/i18n';
import { AppSelect } from '../../../components/calendar/AppSelect';
import { useDevtools } from '../ui/context';
import { NumberField, Option, PanelHeader, Segmented, StatusArea, StatusItem, Toggle, useFieldId } from '../ui/controls';
import { useAnnounceError, useDebounced, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { toolKey, type Tr } from '../ui/text';
import { NO_AUTOCORRECT, lineInputCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';
import { CodePreview, ImageActions, useImageSaver, type ImageSource } from '../ui/CodeImage';
import { ToolFrame } from '../ui/ToolFrame';
import {
  BARCODE_FORMATS, BARCODE_LABEL, barcodeSvg, checkBarcode, encodeBarcode, type BarcodeCheck, type BarcodeFormat,
} from '../tools/codes';

const DEFAULTS = { format: 'CODE128', height: 80, barWidth: '2', showText: true };
const ALLOWED = { format: BARCODE_FORMATS, barWidth: ['1', '2', '3', '4'] } as const;
const EXAMPLES: Record<BarcodeFormat, string> = {
  CODE128: 'Logday-1001', CODE39: 'LOGDAY-1001', EAN13: '770123456789', EAN8: '7701234', UPC: '03600029145', ITF14: '1770123456789', codabar: 'A1001B',
};
/** Margen a cada lado en px: la zona de silencio que piden EAN e ITF. */
const MARGIN = 10;

function checkMessage(tr: Tr, check: Extract<BarcodeCheck, { ok: false }>, format: string): string {
  if (check.kind === 'chars') return tr('error.barcode-chars', { char: check.char, pos: check.pos, format });
  if (check.kind === 'length') {
    const expected = tr('barcodeLengthOr', { a: check.expected[0], b: check.expected[1] });
    return tr('error.barcode-length', { format, expected, actual: check.actual });
  }
  return tr('error.barcode-check-digit', { expected: check.expected, actual: check.actual });
}

export default function BarcodeTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('barcode', DEFAULTS, ALLOWED);
  const format = opts.format as BarcodeFormat;
  const label = BARCODE_LABEL[format];
  const height = Math.min(200, Math.max(20, opts.height));
  const barWidth = Number(opts.barWidth);
  const [input, setInput, cut] = useDraft('barcode');
  const value = useDebounced(input.trim());
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useFieldId('barcode');
  const errorId = useFieldId('barcode-error');
  useFocusOnOpen(ref);
  const saveImage = useImageSaver();

  const check = useMemo(() => (value ? checkBarcode(value, format) : null), [value, format]);
  const encoded = useMemo(() => (check?.ok ? encodeBarcode(check.value, format) : null), [check, format]);
  const lastOk = useRef<string | null>(null);
  const svg = useMemo(
    () => (encoded?.ok ? barcodeSvg(encoded.value, { barWidth, height, showText: opts.showText, margin: MARGIN }) : null),
    [encoded, barWidth, height, opts.showText],
  );
  if (svg) lastOk.current = svg;
  if (!value) lastOk.current = null;
  const invalid = !!check && (!check.ok || (encoded !== null && !encoded.ok));
  const error = check && !check.ok
    ? checkMessage(tr, check, label)
    : encoded && !encoded.ok ? tr('error.barcode-invalid', { format: label }) : null;
  useAnnounceError(error);

  const size = svg ? /width="(\d+)" height="(\d+)"/.exec(svg) : null;
  const image: ImageSource | null = svg && size
    ? { svg, width: Number(size[1]), height: Number(size[2]), baseName: `barcode-${label}-${value.replace(/[^\w.-]+/g, '_').slice(0, 40)}` }
    : null;

  useToolActions({
    copy: image ? () => void copyText(image.svg) : undefined,
    save: image ? () => void saveImage('png', image) : undefined,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
  });

  return (
    <ToolFrame
      bodyClass="grid gap-4 px-5 py-4 @2xl/tool:grid-cols-2"
      options={
        <>
          <Option label={tr('barcodeHeight')}>
            <NumberField label={tr('barcodeHeight')} value={height} min={20} max={200} onChange={(n) => setOpts({ height: n })} />
          </Option>
          <Option label={tr('barcodeBarWidth')}>
            <Segmented label={tr('barcodeBarWidth')} value={opts.barWidth} onChange={(barWidth) => setOpts({ barWidth })} options={['1', '2', '3', '4'].map((w) => ({ value: w, label: w }))} />
          </Option>
          <Toggle label={tr('barcodeShowText')} checked={opts.showText} onChange={(showText) => setOpts({ showText })} />
        </>
      }
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {error && <StatusItem kind="error" id={errorId}>{error}</StatusItem>}
          {check?.ok && check.checkDigit !== undefined && <StatusItem kind="info">{tr('barcodeCheckDigit', { digit: String(check.checkDigit) })}</StatusItem>}
          {check?.ok && check.uppercased && <StatusItem kind="warn">{tr('barcodeUppercased')}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <PanelHeader title={tr('barcodeFormat')} />
          <div role="group" aria-label={tr('barcodeFormat')} className="self-start">
            <AppSelect<string> value={opts.format} onChange={(f) => setOpts({ format: f })} options={BARCODE_FORMATS.map((f) => ({ value: f, label: BARCODE_LABEL[f] }))} />
          </div>
          <p className="text-[11px] text-[var(--text-hint)]">{tr(`barcode.rule.${format}` as DevtoolsKey)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <PanelHeader title={tr('input')} htmlFor={inputId} />
          <input
            id={inputId}
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr(toolKey('barcode', 'placeholder'))}
            aria-invalid={invalid || undefined}
            aria-describedby={error ? errorId : undefined}
            className={lineInputCls(invalid)}
            {...NO_AUTOCORRECT}
          />
          {!input && (
            <button type="button" onClick={() => setInput(EXAMPLES[format])} className="self-start text-[11px] text-indigo-400 hover:underline">
              {tr('tryExample')}
            </button>
          )}
        </div>
      </div>
      <CodePreview
        svg={svg ?? lastOk.current}
        invalid={invalid}
        label={tr('barcodeAlt', { format: label, value: check?.ok ? check.value : value })}
        emptyIcon={Barcode}
        imgClass="[&>svg]:h-auto [&>svg]:max-w-full"
        info={image ? tr('barcodeInfo', { format: label, width: image.width, height: image.height }) : undefined}
        actions={<ImageActions image={image} />}
      />
    </ToolFrame>
  );
}
