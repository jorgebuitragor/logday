import { describe, expect, it } from 'vitest';
import { t } from '../../lib/i18n';
import { COMMON_TIPS, FINAL_STEPS, GUIDES } from './guide';
import { CHAT_PROVIDERS } from './model';

describe('guía para conseguir la URL del webhook', () => {
  it('hay guía para cada proveedor, con ayuda oficial en https', () => {
    for (const p of CHAT_PROVIDERS) {
      expect(GUIDES[p].steps.length, p).toBeGreaterThan(0);
      expect(GUIDES[p].help.url, p).toMatch(/^https:\/\//);
    }
  });

  it('cada texto existe en es y en, sin voseo', () => {
    const keys = [
      ...FINAL_STEPS, ...COMMON_TIPS,
      ...CHAT_PROVIDERS.flatMap((p) => [...GUIDES[p].steps, ...GUIDES[p].tips, GUIDES[p].help.label]),
    ];
    for (const key of keys) {
      for (const lang of ['es', 'en'] as const) expect(t(lang, 'teamChat', key), `${lang} ${key}`).not.toBe(key);
      expect(t('es', 'teamChat', key)).not.toMatch(/\b(querés|podés|tenés|abrí|elegí|pegá|copiá|hacé|entrá|volvé|revisá|pulsá)\b/i);
    }
  });
});
