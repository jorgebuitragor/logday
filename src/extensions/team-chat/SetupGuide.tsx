import { useState } from 'react';
import { ChevronDown, ExternalLink, Lightbulb } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { fs } from '../../lib/invoke';
import type { ChatProvider } from './model';
import { COMMON_TIPS, FINAL_STEPS, GOOGLE_USER_GUIDE, GUIDES, type GuideKey } from './guide';

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

function Steps({ keys }: { keys: GuideKey[] }) {
  const language = useAppStore((s) => s.language);
  return (
    <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
      {keys.map((key) => <li key={key}>{t(language, 'teamChat', key)}</li>)}
    </ol>
  );
}

/** Guía de "Como yo" en Google Chat: los pasos de cada persona y, aparte,
 *  los de quien administra el Workspace (crear el cliente OAuth). */
export function GoogleSetupGuide({ defaultOpen }: { defaultOpen: boolean }) {
  const language = useAppStore((s) => s.language);
  const [open, setOpen] = useState(defaultOpen);
  const [adminOpen, setAdminOpen] = useState(false);
  const g = GOOGLE_USER_GUIDE;
  return (
    <div className="rounded-lg border border-[var(--border-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
      >
        {t(language, 'teamChat', 'guideAsUserTitle')}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
          <Steps keys={g.steps} />
          <div className="space-y-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2">
            {g.tips.map((key) => (
              <p key={key} className="flex gap-1.5 text-[10px] leading-relaxed text-[var(--text-hint)]">
                <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
                <span>{t(language, 'teamChat', key)}</span>
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-[var(--border-card)]">
            <button
              type="button"
              onClick={() => setAdminOpen((v) => !v)}
              aria-expanded={adminOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              {t(language, 'teamChat', 'guideAdminTitle')}
              <ChevronDown size={12} className={`shrink-0 transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
            </button>
            {adminOpen && (
              <div className="border-t border-[var(--border-card)] px-3 py-3">
                <Steps keys={g.adminSteps} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void fs.openUrl(g.help.url)}
            className="inline-flex items-center gap-1 text-[10px] text-indigo-400 underline-offset-2 hover:underline"
          >
            {t(language, 'teamChat', g.help.label)}
            <ExternalLink size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
