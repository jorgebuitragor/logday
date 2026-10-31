import { getCurrentWindow } from '@tauri-apps/api/window';
import type { BuiltInTheme, CustomTheme, Theme } from '../types/theme';
import { deriveCustomThemeVars } from './themeColor';

const CUSTOM_THEME_VARS = [
  '--bg-base', '--bg-panel', '--bg-surface', '--bg-secondary', '--bg-hover', '--bg-elevated', '--bg-input',
  '--border', '--border-card', '--border-high',
  '--text-primary', '--text-body', '--text-secondary', '--text-tertiary', '--text-muted', '--text-hint', '--text-faint',
  '--accent', '--accent-strong', '--accent-soft', '--accent-ink', '--accent-inline', '--accent-link', '--accent-code',
  '--accent-solid', '--accent-on',
] as const;

const TINTED_BUILTIN_THEMES: BuiltInTheme[] = ['high-contrast', 'visual-rest', 'sepia', 'oled', 'nordic'];

export function applyCustomThemeToDOM(customTheme: CustomTheme | null) {
  const root = document.documentElement.style;
  if (!customTheme) {
    CUSTOM_THEME_VARS.forEach((v) => root.removeProperty(v));
    return;
  }
  const vars = deriveCustomThemeVars(customTheme);
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
}

export function applyThemeToDOM(theme: Theme, animate = false, customThemes: CustomTheme[] = []) {
  let resolved: BuiltInTheme;
  let custom: CustomTheme | null = null;

  if (theme.startsWith('custom:')) {
    custom = customThemes.find((t) => `custom:${t.id}` === theme) ?? null;
    resolved = custom?.base ?? 'dark';
  } else {
    resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (theme as BuiltInTheme);
  }

  if (animate) {
    document.documentElement.classList.add('theme-animating');
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-animating');
    }, 280);
  }

  document.documentElement.dataset.theme = resolved;
  applyCustomThemeToDOM(custom);
  document.documentElement.classList.toggle(
    'theme-tinted',
    custom !== null || TINTED_BUILTIN_THEMES.includes(resolved),
  );

  try {
    const nativeTheme = theme === 'system' ? null : (resolved === 'dark' ? 'dark' : 'light');
    void getCurrentWindow().setTheme(nativeTheme).catch(() => {});
  } catch {
    // Puede ejecutarse fuera del contexto Tauri (tests o navegador)
  }
}
