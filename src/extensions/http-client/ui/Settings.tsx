// Opciones → Cliente HTTP (Interfaz §4, HT17–HT22, HT24, HT70–HT75): los
// entornos con sus variables (los mismos que el panel Entornos de la
// pantalla, `EnvironmentsManager`), qué hacer al pegar un cURL, los avisos
// de seguridad y las opciones de las peticiones. Todo es local (R9); los
// valores de los secretos van al llavero (R10).
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Info } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { NumberField, Toggle } from '../../../components/shared/FormControls';
import { CURL_PASTE_MODES, DEFAULT_SETTINGS, EXTENSION_ID, LIMITS, readHttpSettings, type CurlPasteMode } from '../core/environments';
import { makeTr, type Tr } from '../core/text';
import { peekSettingsEnvRequest, takeSettingsEnvRequest } from '../store';
import { extensionSection } from '../../state';
import type { HttpClientKey } from '../../../lib/i18n';
import { TEXT_LINK } from './SendStatus';
import { EnvironmentsManager } from './Environments';
import { FIELD_BTN, Menu } from './Menu';

const HELP = 'pl-9 text-[10px] text-[var(--text-hint)]';

const CURL_MODE_KEY: Record<CurlPasteMode, HttpClientKey> = {
  ask: 'curlPasteAsk',
  variables: 'curlPasteVariables',
  keep: 'curlPasteKeep',
};

/** HT70: qué hacer con los valores sensibles de un cURL pegado. */
export function CurlPastePicker({ tr, mode, onChange }: { tr: Tr; mode: CurlPasteMode; onChange: (mode: CurlPasteMode) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[var(--text-secondary)]" aria-hidden>{tr('curlPasteLabel')}</span>
      <Menu
        label={`${tr('curlPasteLabel')}: ${tr(CURL_MODE_KEY[mode])}`}
        buttonClassName={`${FIELD_BTN} min-w-[12rem]`}
        items={CURL_PASTE_MODES.map((m) => ({ key: m, label: tr(CURL_MODE_KEY[m]), checked: m === mode, onSelect: () => onChange(m) }))}
        button={
          <>
            <span className="flex-1 truncate text-left">{tr(CURL_MODE_KEY[mode])}</span>
            <ChevronDown size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
          </>
        }
      />
    </div>
  );
}

export default function HttpClientSettingsPanel() {
  const { language, raw, update } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[EXTENSION_ID]?.settings,
      update: s.updateExtensionSettings,
    })),
  );
  const tr = makeTr(language);
  const settings = readHttpSettings(raw);
  // El pie lleva a la pantalla del Cliente HTTP (HT33): cierra Opciones y
  // abre la sección.
  const openView = () => {
    const s = useAppStore.getState();
    if (s.isSettingsOpen) s.toggleSettings();
    void s.setSection(extensionSection(EXTENSION_ID));
  };
  // "Definir en Opciones" abre con ese entorno elegido. Se lee en el primer
  // dibujo y se consume después (en modo estricto el inicializador corre dos veces).
  const [initialEnvId] = useState<string | null>(() => peekSettingsEnvRequest());
  useEffect(() => {
    takeSettingsEnvRequest();
  }, []);

  const changed = settings.timeoutSec !== DEFAULT_SETTINGS.timeoutSec
    || settings.maxResponseMb !== DEFAULT_SETTINGS.maxResponseMb
    || settings.followRedirects !== DEFAULT_SETTINGS.followRedirects;

  return (
    <div className="space-y-5 text-xs">
      <section className="space-y-3">
        <div className="space-y-1">
          <p className="font-medium text-[var(--text-secondary)]">{tr('envsTitle')}</p>
          <p className="text-[11px] text-[var(--text-hint)]">{tr('envsIntro')}</p>
        </div>
        <div>
          <Toggle label={tr('useEnvironments')} checked={settings.useEnvironments} onChange={(v) => void update(EXTENSION_ID, { useEnvironments: v })} />
          <p className={HELP}>{tr('useEnvironmentsHelp')}</p>
        </div>
        {settings.useEnvironments ? (
          <EnvironmentsManager tr={tr} initialEnvId={initialEnvId} />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border-high)] px-4 py-3 text-[11px] text-[var(--text-hint)]">
            {tr('envsOff')}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('curlPasteTitle')}</p>
        <CurlPastePicker tr={tr} mode={settings.curlPaste} onChange={(m) => void update(EXTENSION_ID, { curlPaste: m })} />
        <p className="text-[10px] text-[var(--text-hint)]">{tr('curlPasteHelp')}</p>
      </section>

      <section className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('securityTitle')}</p>
        <div>
          <Toggle
            label={tr('confirmUntrustedToggle')}
            checked={settings.confirmUntrustedSecrets}
            onChange={(v) => void update(EXTENSION_ID, { confirmUntrustedSecrets: v })}
          />
          <p className={HELP}>{tr('confirmUntrustedHelp')}</p>
        </div>
        <div>
          <Toggle
            label={tr('maskResponseToggle')}
            checked={settings.maskResponseSecrets}
            onChange={(v) => void update(EXTENSION_ID, { maskResponseSecrets: v })}
          />
          <p className={HELP}>{tr('maskResponseHelp')}</p>
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-medium text-[var(--text-secondary)]">{tr('requestsTitle')}</p>
        <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2">
          <span className="text-[var(--text-secondary)]">{tr('timeout')}</span>
          <NumberField label={tr('timeoutAria')} value={settings.timeoutSec} min={LIMITS.timeoutSec.min} max={LIMITS.timeoutSec.max} width="w-16" onChange={(v) => void update(EXTENSION_ID, { timeoutSec: v })} />
          <span className="text-[var(--text-hint)]">{tr('timeoutUnit')}</span>
          <span className="text-[var(--text-secondary)]">{tr('maxSize')}</span>
          <NumberField label={tr('maxSizeAria')} value={settings.maxResponseMb} min={LIMITS.maxResponseMb.min} max={LIMITS.maxResponseMb.max} width="w-16" onChange={(v) => void update(EXTENSION_ID, { maxResponseMb: v })} />
          <span className="text-[var(--text-hint)]">{tr('maxSizeUnit')}</span>
        </div>
        <Toggle label={tr('followRedirects')} checked={settings.followRedirects} onChange={(v) => void update(EXTENSION_ID, { followRedirects: v })} />
        <p className="text-[10px] text-[var(--text-hint)]">{tr('rangesHelp')}</p>
        {changed && (
          <button
            type="button"
            onClick={() => void update(EXTENSION_ID, {
              timeoutSec: DEFAULT_SETTINGS.timeoutSec, maxResponseMb: DEFAULT_SETTINGS.maxResponseMb, followRedirects: DEFAULT_SETTINGS.followRedirects,
            })}
            className={SECONDARY_CLS}
          >
            {tr('resetValues')}
          </button>
        )}
      </section>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-[var(--text-hint)]">
        <Info size={12} aria-hidden />
        {tr('viewHint')}
        <button type="button" onClick={openView} className={TEXT_LINK}>{tr('viewHintOpen')}</button>
      </p>
    </div>
  );
}
