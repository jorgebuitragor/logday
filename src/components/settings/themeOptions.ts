// Los 8 temas de la app con su ícono, nombre y descripción. Los usan
// Opciones → General y la bienvenida (specs/onboarding OB10).
import { AlertTriangle, BookOpen, Eye, Monitor, Moon, Smartphone, Snowflake, Sun } from 'lucide-react';
import type { Theme } from '../../types/theme';
import type { Language } from '../../types/common';
import { t } from '../../lib/i18n';

const THEMES = [
  { value: 'system', Icon: Monitor, label: 'themeSystem', desc: 'themeDescSystem' },
  { value: 'light', Icon: Sun, label: 'themeLight', desc: 'themeDescLight' },
  { value: 'dark', Icon: Moon, label: 'themeDark', desc: 'themeDescDark' },
  { value: 'high-contrast', Icon: AlertTriangle, label: 'themeHighContrast', desc: 'themeDescHighContrast' },
  { value: 'visual-rest', Icon: Eye, label: 'themeVisualRest', desc: 'themeDescVisualRest' },
  { value: 'sepia', Icon: BookOpen, label: 'themeSepia', desc: 'themeDescSepia' },
  { value: 'oled', Icon: Smartphone, label: 'themeOled', desc: 'themeDescOled' },
  { value: 'nordic', Icon: Snowflake, label: 'themeNordic', desc: 'themeDescNordic' },
] as const;

export interface ThemeOption {
  value: Theme;
  Icon: React.ElementType;
  label: string;
  desc: string;
}

export function themeOptions(language: Language): ThemeOption[] {
  return THEMES.map(({ value, Icon, label, desc }) => ({
    value,
    Icon,
    label: t(language, 'settings', label),
    desc: t(language, 'settings', desc),
  }));
}
