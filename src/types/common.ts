export type Language = 'es' | 'en';

export type ToastKind = 'success' | 'error' | 'info';

export interface AppToast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  exiting?: boolean;
}
