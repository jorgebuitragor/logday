import { describe, expect, it } from 'vitest';
import {
  canContinue, canSkipAll, createBaseFolders, initialLanguage, inspectFolder, isICloudPath, nextStep, prevStep, systemLanguage,
} from './onboarding';

describe('la carpeta (OB6–OB8)', () => {
  it('reconoce las rutas de iCloud Drive', () => {
    expect(isICloudPath('/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Logday')).toBe(true);
    expect(isICloudPath('/Users/ana/iCloud Drive/Logday')).toBe(true);
    expect(isICloudPath('/Users/ana/Documents/Logday')).toBe(false);
  });

  it('tiene datos si existe projects, notes o dailys', async () => {
    const existing = new Set(['/d/dailys']);
    const exists = async (p: string) => existing.has(p);
    expect(await inspectFolder('/d', exists)).toEqual({ path: '/d', isICloud: false, hasData: true });
    expect((await inspectFolder('/vacia', exists)).hasData).toBe(false);
  });

  it('crea projects/inbox, notes y dailys, y lanza si una falla (OB9)', async () => {
    const made: string[] = [];
    await createBaseFolders('/d', async (p) => { made.push(p); });
    expect(made).toEqual(['/d/projects/inbox', '/d/notes', '/d/dailys']);
    await expect(createBaseFolders('/d', async () => { throw new Error('EACCES'); })).rejects.toThrow('EACCES');
  });
});

describe('el idioma (OB5)', () => {
  it('se preelige el del sistema: es* es español; lo demás, inglés', () => {
    expect(systemLanguage('es-CO')).toBe('es');
    expect(systemLanguage('ES')).toBe('es');
    expect(systemLanguage('en-US')).toBe('en');
    expect(systemLanguage('pt-BR')).toBe('en');
    expect(systemLanguage(undefined)).toBe('en');
  });

  it('el guardado gana al del sistema', () => {
    expect(initialLanguage('es', 'en-US')).toBe('es');
    expect(initialLanguage('en', 'es-CO')).toBe('en');
    expect(initialLanguage(null, 'es-MX')).toBe('es');
    expect(initialLanguage('fr', 'en-GB')).toBe('en');
  });
});

describe('los pasos (OB1, OB2)', () => {
  it('sin carpeta no se sigue en el paso 2', () => {
    expect(canContinue(2, null)).toBe(false);
    expect(canContinue(2, { path: '/d', isICloud: false, hasData: false })).toBe(true);
    expect(canContinue(1, null)).toBe(true);
  });

  it('"Omitir y abrir Logday" solo en los pasos 3 y 4, con carpeta', () => {
    const folder = { path: '/d', isICloud: false, hasData: false };
    expect([1, 2, 3, 4, 5].map((s) => canSkipAll(s as 1, folder))).toEqual([false, false, true, true, false]);
    expect(canSkipAll(3, null)).toBe(false);
  });

  it('de 1 a 5, sin salirse', () => {
    expect(nextStep(5)).toBe(5);
    expect(prevStep(1)).toBe(1);
    expect(nextStep(2)).toBe(3);
  });
});
