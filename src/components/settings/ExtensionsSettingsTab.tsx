import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { Language } from '../../types/common';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import ToggleSwitch from '../shared/ToggleSwitch';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { useExtensions } from '../../extensions/useExtensions';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import { extensionText } from '../../extensions/text';
import type { ExtensionCategory, ExtensionDefinition, ExtensionId, LogdayApp } from '../../extensions/types';

const GROUPS: { category: ExtensionCategory; labelKey: 'groupIntegrations' | 'groupTools' }[] = [
  { category: 'integration', labelKey: 'groupIntegrations' },
  { category: 'tool', labelKey: 'groupTools' },
];

const APP_LABELS: Record<LogdayApp, string> = { desktop: 'Desktop', web: 'Web', mobile: 'Mobile' };

const extText = extensionText;

function ConsentModal({
  language, id, onAccept, onCancel,
}: { language: Language; id: ExtensionId; onAccept: () => void; onCancel: () => void }) {
  return (
    <ModalOverlay zIndex={Z_MODAL_NESTED}>
      <ModalPanel className="w-96 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldAlert size={16} className="shrink-0 text-amber-400" />
          {t(language, 'extensions', 'consentTitle')}
        </div>
        <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">{extText(language, id, 'name')}</p>
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">{extText(language, id, 'consent')}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            {t(language, 'extensions', 'consentCancel')}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            {t(language, 'extensions', 'consentAccept')}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}

function ExtensionCard({
  def, language, enabled, hasConfig, onToggle, onRemove,
}: {
  def: ExtensionDefinition;
  language: Language;
  enabled: boolean;
  hasConfig: boolean;
  onToggle: (next: boolean) => void;
  onRemove: () => void;
}) {
  const Icon = def.icon;
  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--text-primary)]">{extText(language, def.id, 'name')}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-hint)]">{extText(language, def.id, 'description')}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-[var(--text-faint)]">{t(language, 'extensions', 'appsLabel')}</span>
            {def.apps.map((app) => (
              <span key={app} className="rounded-full border border-[var(--border)] px-1.5 py-px text-[9px] text-[var(--text-hint)]">
                {APP_LABELS[app]}
              </span>
            ))}
          </div>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      </div>
      {(enabled || hasConfig) && (
        <div className="space-y-3 border-t border-[var(--border-card)] px-4 py-3">
          {enabled && <ExtensionSlot id={def.id} point="Settings" props={{}} />}
          {hasConfig && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg px-2.5 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
              >
                {t(language, 'extensions', 'removeConfig')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Opciones → Extensiones: catálogo, activación con aviso y "Quitar
 *  configuración" (specs/extensiones R1–R8). */
export function ExtensionsSettingsTab() {
  const { language, confirmDestructiveActions, removeExtensionConfig, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      confirmDestructiveActions: s.confirmDestructiveActions,
      removeExtensionConfig: s.removeExtensionConfig,
      showToast: s.showToast,
    })),
  );
  const { all, isEnabled, prefs, requestEnable, acceptConsent, disable } = useExtensions();
  const [consentFor, setConsentFor] = useState<ExtensionId | null>(null);
  const removeDialog = useConfirmDelete<ExtensionId>(confirmDestructiveActions);

  const handleToggle = async (id: ExtensionId, next: boolean) => {
    if (!next) {
      await disable(id);
      return;
    }
    if ((await requestEnable(id)) === 'needs-consent') setConsentFor(id);
  };

  const handleRemove = async (id: ExtensionId) => {
    removeDialog.cancel();
    try {
      await removeExtensionConfig(id);
    } catch (err) {
      showToast({ kind: 'error', title: t(language, 'extensions', 'removeConfigError'), description: String(err) });
    }
  };

  const byName = (a: ExtensionDefinition, b: ExtensionDefinition) =>
    extText(language, a.id, 'name').localeCompare(extText(language, b.id, 'name'), language);

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--text-hint)]">{t(language, 'extensions', 'intro')}</p>

      {all.length === 0 && (
        <p className="py-6 text-center text-xs text-[var(--text-hint)]">{t(language, 'extensions', 'empty')}</p>
      )}

      {GROUPS.map(({ category, labelKey }) => {
        const defs = all.filter((d) => d.category === category).sort(byName);
        if (defs.length === 0) return null;
        return (
          <section key={category} className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'extensions', labelKey)}
            </h3>
            {defs.map((def) => (
              <ExtensionCard
                key={def.id}
                def={def}
                language={language}
                enabled={isEnabled(def.id)}
                hasConfig={!!prefs(def.id)}
                onToggle={(next) => void handleToggle(def.id, next)}
                onRemove={() => removeDialog.request(def.id, (id) => void handleRemove(id))}
              />
            ))}
          </section>
        );
      })}

      {consentFor && (
        <ConsentModal
          language={language}
          id={consentFor}
          onCancel={() => setConsentFor(null)}
          onAccept={() => {
            const id = consentFor;
            setConsentFor(null);
            void acceptConsent(id);
          }}
        />
      )}

      {removeDialog.pending && (
        <ConfirmDeleteModal
          zIndex={Z_MODAL_NESTED}
          title={t(language, 'extensions', 'removeConfigTitle')}
          message={t(language, 'extensions', 'removeConfigMessage')}
          cancelLabel={t(language, 'extensions', 'removeConfigCancel')}
          confirmLabel={t(language, 'extensions', 'removeConfigConfirm')}
          onCancel={removeDialog.cancel}
          onConfirm={() => void handleRemove(removeDialog.pending as ExtensionId)}
        />
      )}
    </div>
  );
}
