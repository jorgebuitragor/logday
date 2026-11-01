// Lógica pura de la bienvenida (specs/onboarding): la carpeta elegida, el
// idioma preelegido y los pasos. Sin React ni store, para probarla sola.
import type { Language } from '../types/common';

/** Lo que devuelve `pickBaseFolder`: la carpeta y lo que se sabe de ella. */
export interface PickedFolder {
  path: string;
  /** OB7: dentro de iCloud Drive, donde la app puede congelarse. */
  isICloud: boolean;
  /** OB8: ya tiene `projects`, `notes` o `dailys`. */
  hasData: boolean;
}

/** Las carpetas que delatan datos de Logday (OB8). */
export const LOGDAY_DATA_DIRS = ['projects', 'notes', 'dailys'] as const;

/** Las que se crean al terminar (OB3); `projects/inbox` crea también `projects`. */
export const BASE_DIRS = ['projects/inbox', 'notes', 'dailys'] as const;

export function isICloudPath(path: string): boolean {
  return (
    path.includes('/Library/Mobile Documents') ||
    path.includes('com~apple~CloudDocs') ||
    path.includes('/iCloud Drive/')
  );
}

/** Comprueba la carpeta sin crear nada. */
export async function inspectFolder(path: string, exists: (p: string) => Promise<boolean>): Promise<PickedFolder> {
  const found = await Promise.all(LOGDAY_DATA_DIRS.map((dir) => exists(`${path}/${dir}`)));
  return { path, isICloud: isICloudPath(path), hasData: found.some(Boolean) };
}

/** Crea las carpetas de trabajo; si una falla, lanza el error (OB9). */
export async function createBaseFolders(path: string, createDir: (p: string) => Promise<void>): Promise<void> {
  for (const dir of BASE_DIRS) await createDir(`${path}/${dir}`);
}

/** OB5: el idioma del sistema; `es-CO`, `es` → español, el resto, inglés. */
export function systemLanguage(navigatorLanguage: string | undefined): Language {
  return navigatorLanguage?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** El idioma con que arranca la app: el guardado o, si no hay, el del sistema. */
export function initialLanguage(stored: string | null, navigatorLanguage: string | undefined): Language {
  return stored === 'es' || stored === 'en' ? stored : systemLanguage(navigatorLanguage);
}

// ── Pasos ─────────────────────────────────────────────────────

export const ONBOARDING_STEPS = 5;
export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

/** OB2: en el paso 2 no se sigue sin carpeta. */
export function canContinue(step: OnboardingStep, folder: PickedFolder | null): boolean {
  return step !== 2 || folder !== null;
}

/** OB2: "Omitir y abrir Logday" solo desde el paso 3, cuando ya hay carpeta;
 *  el 5 tiene su propio "Abrir Logday". */
export function canSkipAll(step: OnboardingStep, folder: PickedFolder | null): boolean {
  return (step === 3 || step === 4) && folder !== null;
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  return Math.min(ONBOARDING_STEPS, step + 1) as OnboardingStep;
}

export function prevStep(step: OnboardingStep): OnboardingStep {
  return Math.max(1, step - 1) as OnboardingStep;
}
