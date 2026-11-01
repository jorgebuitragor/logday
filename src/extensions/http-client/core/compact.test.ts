// Bloque compacto: la clave estable de cada bloque y lo que se recuerda
// (puro, con un almacenamiento de mentira).
import { describe, expect, it } from 'vitest';
import {
  COMPACT_STORAGE_KEY, blockSignature, compactKey, compactSummary, hashText, initialCompact, loadCompact, moveCompact,
  movedCompact, parseCompactMap, saveCompact, withCompact,
} from './compact';
import { parseHttpBlock } from './parse';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const broken = {
  getItem: () => {
    throw new Error('sin almacenamiento');
  },
  setItem: () => {
    throw new Error('lleno');
  },
};

describe('la clave de un bloque', () => {
  it('la firma es el método y la URL sin resolver de la primera petición', () => {
    expect(blockSignature('### Listar\n# comentario\nGET {{baseUrl}}/users?limit=2\nAccept: */*')).toBe('GET {{baseUrl}}/users?limit=2');
    // Solo URL: un GET.
    expect(blockSignature('https://x.com')).toBe('GET https://x.com');
    expect(blockSignature('')).toBe('');
  });

  it('el hash es corto y estable', () => {
    expect(hashText('GET https://x.com')).toBe(hashText('GET https://x.com'));
    expect(hashText('GET https://x.com')).not.toBe(hashText('GET https://y.com'));
    expect(hashText('GET https://x.com')).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it('agregar o quitar otros bloques antes no la cambia; editar su URL, sí', () => {
    const a = 'GET https://x.com/a';
    const key = compactKey('n1', a, []);
    expect(compactKey('n1', a, ['POST https://x.com/b', 'GET https://otro'])).toBe(key);
    expect(compactKey('n1', 'GET https://x.com/a2', [])).not.toBe(key);
    expect(compactKey('n2', a, [])).not.toBe(key);
    // El cuerpo y las cabeceras no cuentan.
    expect(compactKey('n1', `${a}\nAccept: */*\n\n{"x":1}`, [])).toBe(key);
  });

  it('dos bloques con la misma petición: cuenta los gemelos de antes', () => {
    const a = 'GET https://x.com/a';
    expect(compactKey('n1', a, [a])).not.toBe(compactKey('n1', a, []));
    expect(compactKey('n1', a, [a, 'POST https://y'])).toBe(compactKey('n1', a, ['POST https://z', a]));
    expect(compactKey('n1', a, [a])).toMatch(/#1$/);
  });
});

describe('lo que se recuerda', () => {
  it('lo que no se entiende se descarta', () => {
    expect(parseCompactMap(null)).toEqual({});
    expect(parseCompactMap('no es json')).toEqual({});
    expect(parseCompactMap('[1,2]')).toEqual({});
    expect(parseCompactMap(JSON.stringify({ a: { compact: true, at: 1 }, b: { compact: 'sí', at: 2 }, c: null, d: { compact: false } }))).toEqual({
      a: { compact: true, at: 1 },
    });
  });

  it('al pasar del tope se olvidan los tocados hace más tiempo, nunca el de ahora', () => {
    let map = {};
    for (let i = 0; i < 5; i += 1) map = withCompact(map, `k${i}`, true, i, 3);
    expect(Object.keys(map).sort()).toEqual(['k2', 'k3', 'k4']);
    map = withCompact(map, 'k2', false, 10, 3);
    expect(map).toMatchObject({ k2: { compact: false, at: 10 } });
    expect(Object.keys(withCompact(map, 'nuevo', true, 0, 3))).toContain('nuevo');
  });

  it('mover: lo elegido pasa a la clave nueva', () => {
    const map = { a: { compact: true, at: 1 } };
    expect(movedCompact(map, 'a', 'b')).toEqual({ b: { compact: true, at: 1 } });
    expect(movedCompact(map, 'x', 'b')).toBe(map);
    expect(movedCompact(map, 'a', 'a')).toBe(map);
  });

  it('con qué arranca: lo elegido, y si nunca se eligió, la opción', () => {
    expect(initialCompact(null, false)).toBe(false);
    expect(initialCompact(null, true)).toBe(true);
    expect(initialCompact(false, true)).toBe(false);
    expect(initialCompact(true, false)).toBe(true);
  });

  it('guardar, leer y mover en el almacenamiento, en una sola clave', () => {
    const storage = memoryStorage();
    expect(loadCompact('n1#a#0', storage)).toBeNull();
    saveCompact('n1#a#0', true, 5, storage);
    expect(loadCompact('n1#a#0', storage)).toBe(true);
    saveCompact('n1#a#0', false, 6, storage);
    expect(loadCompact('n1#a#0', storage)).toBe(false);
    moveCompact('n1#a#0', 'n1#b#0', storage);
    expect(loadCompact('n1#a#0', storage)).toBeNull();
    expect(loadCompact('n1#b#0', storage)).toBe(false);
    expect(Object.keys(storage.data)).toEqual([COMPACT_STORAGE_KEY]);
    // Nada de la URL en claro: solo la nota y el hash.
    saveCompact(compactKey('n1', 'GET https://api.ejemplo.test/secreto'), true, 7, storage);
    expect(storage.data[COMPACT_STORAGE_KEY]).not.toContain('ejemplo');
  });

  it('sin almacenamiento (o si falla) no rompe: no se recuerda', () => {
    expect(loadCompact('k', null)).toBeNull();
    expect(() => saveCompact('k', true, 1, null)).not.toThrow();
    expect(loadCompact('k', broken)).toBeNull();
    expect(() => saveCompact('k', true, 1, broken)).not.toThrow();
    expect(() => moveCompact('k', 'j', broken)).not.toThrow();
  });
});

describe('el resumen de la barra compacta', () => {
  it('la URL sin https://, con las variables como están', () => {
    expect(compactSummary(parseHttpBlock('GET https://api.ejemplo.test/users?limit=2').requests[0])).toBe('api.ejemplo.test/users?limit=2');
    expect(compactSummary(parseHttpBlock('POST {{baseUrl}}/users').requests[0])).toBe('{{baseUrl}}/users');
    expect(compactSummary(parseHttpBlock('GET http://localhost:8080/').requests[0])).toBe('localhost:8080/');
    expect(compactSummary(null)).toBeNull();
  });
});
