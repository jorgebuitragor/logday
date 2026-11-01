// Código QR (specs/devtools D15, Adenda B.2). Siempre negro sobre blanco.
import { useMemo, useRef } from 'react';
import { Eraser, QrCode, TriangleAlert } from 'lucide-react';
import { useDevtools } from '../ui/context';
import { IconButton, NumberField, Option, PanelHeader, Segmented, StatusArea, StatusItem, useFieldId } from '../ui/controls';
import { useAnnounceError, useDebounced, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { toolKey } from '../ui/text';
import { NO_AUTOCORRECT, textareaCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';
import { CodePreview, fileStamp, ImageActions, useImageSaver, type ImageSource } from '../ui/CodeImage';
import { ToolFrame } from '../ui/ToolFrame';
import { QR_MAX_BYTES, qrByteLength, qrMatrix, qrSvg, type QrLevel, type QrMatrix } from '../tools/codes';

const LEVELS: readonly QrLevel[] = ['L', 'M', 'Q', 'H'];
const DEFAULTS = { level: 'M', size: '512', margin: 4 };
const ALLOWED = { level: LEVELS, size: ['256', '512', '1024'] } as const;
const EXAMPLE = 'https://logday.app/notas?id=1001';

export default function QrTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('qr', DEFAULTS, ALLOWED);
  const level = opts.level as QrLevel;
  const margin = Math.min(8, Math.max(0, opts.margin));
  const px = Number(opts.size);
  const [input, setInput, cut] = useDraft('qr');
  const text = useDebounced(input);
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useFieldId('qr');
  const errorId = useFieldId('qr-error');
  useFocusOnOpen(ref);
  const saveImage = useImageSaver();

  const bytes = qrByteLength(input);
  const max = QR_MAX_BYTES[level];
  const result = useMemo(() => (text ? qrMatrix(text, level) : null), [text, level]);
  // El último código válido, para mostrarlo gris mientras hay un error.
  const lastOk = useRef<QrMatrix | null>(null);
  if (result?.ok) lastOk.current = result.value;
  if (!text) lastOk.current = null;
  const matrix = result?.ok ? result.value : lastOk.current;
  const invalid = !!result && !result.ok;
  useAnnounceError(invalid ? tr('error.qr-too-long', { level, bytes: qrByteLength(text), max }) : null);

  const image: ImageSource | null = useMemo(() => {
    if (!matrix || invalid) return null;
    const total = matrix.size + margin * 2;
    return { svg: qrSvg(matrix, { scale: px / total, margin }), width: px, height: px, baseName: `qr-${fileStamp()}` };
  }, [matrix, invalid, margin, px]);
  // La vista previa no cambia con "Tamaño": solo el archivo.
  const previewSvg = useMemo(() => (matrix ? qrSvg(matrix, { scale: 8, margin }) : null), [matrix, margin]);
  // El nivel más alto, por debajo del elegido, en el que cabría.
  const lower = invalid ? LEVELS.slice(0, LEVELS.indexOf(level)).reverse().find((l) => qrByteLength(text) <= QR_MAX_BYTES[l]) : undefined;

  useToolActions({
    copy: image ? () => void copyText(image.svg) : undefined,
    save: image ? () => void saveImage('png', image) : undefined,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
  });

  const shortText = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  const near = bytes > max * 0.9;

  return (
    <ToolFrame
      bodyClass="grid gap-4 px-5 py-4 @2xl/tool:grid-cols-2"
      options={
        <>
          <Option label={tr('qrCorrection')}>
            <Segmented
              label={tr('qrCorrection')}
              value={opts.level}
              onChange={(l) => setOpts({ level: l })}
              mono
              options={LEVELS.map((l) => ({ value: l, label: l, title: tr(`qrLevel.${l}`) }))}
            />
          </Option>
          <Option label={tr('qrSize')}>
            <Segmented label={tr('qrSize')} value={opts.size} onChange={(size) => setOpts({ size })} options={['256', '512', '1024'].map((s) => ({ value: s, label: `${s} px` }))} />
          </Option>
          <Option label={tr('qrMargin')} hint={tr('qrMarginUnit')}>
            <NumberField label={tr('qrMargin')} value={margin} min={0} max={8} onChange={(n) => setOpts({ margin: n })} />
          </Option>
        </>
      }
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {invalid && (
            <StatusItem kind="error" id={errorId}>
              {tr('error.qr-too-long', { level, bytes, max })}
              {lower && ` ${tr('qrFitsLower', { level: lower })}`}
            </StatusItem>
          )}
          {margin < 4 && <StatusItem kind="warn">{tr('qrMarginLow')}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('input')} htmlFor={inputId}>
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={() => setInput('')} />
        </PanelHeader>
        <textarea
          id={inputId}
          ref={ref}
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(toolKey('qr', 'placeholder'))}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={textareaCls(invalid, 'min-h-[6rem]')}
          {...NO_AUTOCORRECT}
        />
        <p className={`flex items-center gap-1 text-[11px] tabular-nums ${near ? 'text-amber-400' : 'text-[var(--text-hint)]'}`}>
          {near && <TriangleAlert size={11} aria-hidden />}
          {tr('qrCapacity', { bytes, max })}
        </p>
        {!input && (
          <button type="button" onClick={() => setInput(EXAMPLE)} className="self-start text-[11px] text-indigo-400 hover:underline">
            {tr('tryExample')}
          </button>
        )}
      </div>
      <CodePreview
        svg={previewSvg}
        invalid={invalid}
        label={tr('qrAlt', { text: shortText })}
        emptyIcon={QrCode}
        imgClass="w-[min(16rem,100%)] [&>svg]:h-auto [&>svg]:w-full"
        info={matrix ? tr('qrInfo', { version: matrix.version, modules: matrix.size, px }) : undefined}
        actions={<ImageActions image={image} />}
      />
    </ToolFrame>
  );
}
