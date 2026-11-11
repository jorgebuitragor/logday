// Los avisos de una skill (SK7), con su explicación: en el detalle, el
// editor y la vista previa de instalar.
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { RISK_WARNINGS, type Warning } from './model';
import { trCode, type Tr } from './text';

export function WarningList({ warnings, tr }: { warnings: Warning[]; tr: Tr }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1.5" aria-label={tr('warningsLabel')}>
      {warnings.map((w) => {
        const risky = RISK_WARNINGS.has(w);
        const Icon = risky ? ShieldAlert : TriangleAlert;
        return (
          <li key={w} className="flex items-start gap-2 text-xs">
            <Icon size={14} className={`mt-px shrink-0 ${risky ? 'text-amber-400' : 'text-[var(--text-hint)]'}`} aria-hidden />
            <span>
              <span className="font-medium text-[var(--text-primary)]">{trCode(tr, 'warn', w, 'warn.unknown')}</span>
              <span className="text-[var(--text-secondary)]"> — {trCode(tr, 'warnHelp', w, 'warn.unknown')}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

