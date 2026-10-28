import { useState } from 'react';
import { ChevronDown, ExternalLink, Lightbulb } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { fs } from '../../lib/invoke';
import type { ChatProvider } from './model';
import { COMMON_TIPS, FINAL_STEPS, GUIDES } from './guide';

/** Guía para conseguir la URL del webhook, según el proveedor elegido.
 *  Los pasos y sus textos están en guide.ts. */
export function SetupGuide({ provider, defaultOpen }: { provider: ChatProvider; defaultOpen: boolean }) {
  const language = useAppStore((s) => s.language);
  const [open, setOpen] = useState(defaultOpen);
  const guide = GUIDES[provider];
  const steps = [...guide.steps, ...FINAL_STEPS];

  return (
    <div className="rounded-lg border border-[var(--border-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
      >
        {t(language, 'teamChat', 'guideTitle')}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
          <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {steps.map((key) => <li key={key}>{t(language, 'teamChat', key)}</li>)}
          </ol>
          <div className="space-y-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2">
            {[...guide.tips, ...COMMON_TIPS].map((key) => (
              <p key={key} className="flex gap-1.5 text-[10px] leading-relaxed text-[var(--text-hint)]">
                <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
                <span>{t(language, 'teamChat', key)}</span>
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fs.openUrl(guide.help.url)}
            className="inline-flex items-center gap-1 text-[10px] text-indigo-400 underline-offset-2 hover:underline"
          >
            {t(language, 'teamChat', guide.help.label)}
            <ExternalLink size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
