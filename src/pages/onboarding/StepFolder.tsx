// Paso 2: la carpeta de trabajo (specs/onboarding OB2, OB6–OB8). Elegirla
// no termina la bienvenida (OB3): por eso el aviso de iCloud sí se ve.
import { AlertTriangle, FolderOpen, Info } from 'lucide-react';
import type { PickedFolder } from '../../lib/onboarding';
import { FOCUS_RING, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { OnboardingLayout, PRIMARY_BTN, useOnboardingText } from './OnboardingLayout';

const NEED_FOLDER_ID = 'onboarding-need-folder';

export function StepFolder({ folder, picking, pickError, onPick, onBack, onContinue }: {
  folder: PickedFolder | null;
  picking: boolean;
  pickError: boolean;
  onPick: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const tr = useOnboardingText();
  return (
    <OnboardingLayout
      step={2}
      focusTitle
      title={tr('folderTitle')}
      intro={<p>{tr('folderBody')}</p>}
      onBack={onBack}
      primary={{
        label: tr('continue'),
        onClick: onContinue,
        disabled: !folder,
        describedBy: folder ? undefined : NEED_FOLDER_ID,
      }}
    >
      {folder ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
          <FolderOpen size={16} className="shrink-0 text-indigo-400" />
          <span title={folder.path} className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]">{folder.path}</span>
          <button type="button" onClick={onPick} disabled={picking} className={SECONDARY_CLS}>
            {picking ? tr('opening') : tr('change')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          disabled={picking}
          className={`${PRIMARY_BTN} flex w-full items-center justify-center gap-2`}
        >
          <FolderOpen size={16} />
          {picking ? tr('opening') : tr('pick')}
        </button>
      )}

      {/* OB6: la ruta elegida se anuncia. */}
      <p aria-live="polite" className="sr-only">{folder ? tr('chosen', { path: folder.path }) : ''}</p>

      {!folder && (
        <p id={NEED_FOLDER_ID} className="mt-2 text-[11px] text-[var(--text-hint)]">{tr('needFolder')}</p>
      )}

      {pickError && (
        <p role="alert" className="mt-3 text-xs text-red-400">{tr('folderError')}</p>
      )}

      {folder?.isICloud && (
        // OB7: solo un aviso; se puede seguir con esta carpeta. El texto va
        // en --text-secondary: amber-300/80 no contrasta en claro ni en sepia.
        <div role="alert" className="mt-3 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <p className="text-xs font-semibold text-amber-400">{tr('icloudTitle')}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{tr('icloudBody')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onPick}
            disabled={picking}
            className={`rounded text-[11px] text-amber-400 underline underline-offset-2 hover:text-amber-300 ${FOCUS_RING}`}
          >
            {tr('icloudAction')}
          </button>
        </div>
      )}

      {folder?.hasData && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-indigo-400" />
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{tr('existing')}</p>
        </div>
      )}

      {!folder?.isICloud && (
        <p className="mt-4 text-[11px] text-[var(--text-hint)]">{tr('localHint')}</p>
      )}
    </OnboardingLayout>
  );
}
