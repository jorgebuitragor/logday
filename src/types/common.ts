export type Language = 'es' | 'en';

export type ToastKind = 'success' | 'error' | 'info';

export interface AppToast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Botón en el aviso, p. ej. "Deshacer". Al pulsarlo el aviso se cierra. */
  action?: { label: string; onClick: () => void };
  exiting?: boolean;
}
