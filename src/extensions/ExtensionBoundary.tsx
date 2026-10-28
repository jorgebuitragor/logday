import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../lib/i18n';
import type { Language } from '../types/common';
import type { ExtensionId } from './types';

interface Props {
  id: ExtensionId;
  language: Language;
  /** Desactiva la extensión desde el aviso de error. */
  onDisable: () => void;
  /** 'inline' para los botones de una barra (junto a Copiar). */
  variant?: 'block' | 'inline';
  children: ReactNode;
}

interface State {
  error: unknown;
}

/** Aviso que se muestra en lugar de la extensión que falló. */
export function ExtensionErrorNotice({
  language, onDisable, variant = 'block',
}: Pick<Props, 'language' | 'onDisable' | 'variant'>) {
  const inline = variant === 'inline';
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 ${
        inline ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-xs'
      }`}
    >
      <AlertTriangle size={inline ? 11 : 13} className="shrink-0" />
      <span className="flex-1">{t(language, 'extensions', 'errorNotice')}</span>
      <button
        type="button"
        onClick={onDisable}
        className="rounded-md px-2 py-0.5 font-medium text-amber-300 transition hover:bg-amber-500/20"
      >
        {t(language, 'extensions', 'errorDisable')}
      </button>
    </div>
  );
}

/** ErrorBoundary por extensión (R15): un error dentro de una extensión
 *  solo afecta a su punto de la app. El ErrorBoundary global cierra la app
 *  entera (fue lo que pasó con la vista previa de enlaces, v1.0.7). */
export class ExtensionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Error sin detalle') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[extensión ${this.props.id}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ExtensionErrorNotice
          language={this.props.language}
          onDisable={this.props.onDisable}
          variant={this.props.variant}
        />
      );
    }
    return this.props.children;
  }
}
