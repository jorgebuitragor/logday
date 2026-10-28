import { describe, expect, it } from 'vitest';
import { t } from '../lib/i18n';
import { EXTENSIONS, getExtension } from './registry';

describe('registro de extensiones', () => {
  it('trae "Chat del equipo" como integración de Desktop', () => {
    const chat = getExtension('team-chat');
    expect(chat?.category).toBe('integration');
    expect(chat?.apps).toContain('desktop');
    expect(chat?.sendsDataExternally).toBeTruthy();
    expect(chat?.secretKeys).toEqual(['webhook']);
  });

  it('los ids son únicos y todas existen en Desktop (R4)', () => {
    const ids = EXTENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of EXTENSIONS) expect(def.apps).toContain('desktop');
  });

  it('cada extensión tiene nombre, descripción y, si envía datos, aviso, en es y en (R20)', () => {
    for (const def of EXTENSIONS) {
      const fields = ['name', 'description', ...(def.sendsDataExternally ? ['consent'] : [])];
      for (const lang of ['es', 'en'] as const) {
        for (const field of fields) {
          const key = `${def.id}.${field}`;
          // t devuelve la clave cuando falta el texto.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expect(t(lang, 'extensions', key as any), `${lang} ${key}`).not.toBe(key);
        }
      }
    }
  });

  it('sin voseo en los textos en español', () => {
    for (const def of EXTENSIONS) {
      for (const field of ['name', 'description', 'consent']) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = t('es', 'extensions', `${def.id}.${field}` as any);
        expect(text).not.toMatch(/\b(querés|podés|tenés|activá|configurá|pegá|usás)\b/i);
      }
    }
  });

  it('las extensiones con panel lo declaran en el registro (R21)', () => {
    // Los módulos no se cargan aquí (usan la API de Tauri): si una
    // extensión agrega o quita su `Settings`, hay que tocar también esto.
    expect(EXTENSIONS.filter((d) => d.settings).map((d) => d.id)).toEqual(['team-chat', 'mcp']);
  });

  it('una id desconocida no existe', () => {
    expect(getExtension('jira')).toBeUndefined();
  });
});
