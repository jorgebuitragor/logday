import { gemoji } from 'gemoji';

export type EmojiOption = {
  emoji: string;
  nameEs: string;
  nameEn: string;
  keywords: string[];
};

const ES_TOKEN_MAP: Record<string, string[]> = {
  smile: ['sonrisa'],
  happy: ['feliz', 'alegre'],
  laugh: ['risa'],
  joy: ['alegria'],
  wink: ['guino'],
  heart: ['corazon', 'amor'],
  fire: ['fuego'],
  rocket: ['cohete', 'lanzamiento'],
  target: ['objetivo', 'meta'],
  pin: ['fijar'],
  note: ['nota'],
  memo: ['memo', 'nota'],
  warning: ['advertencia', 'alerta'],
  check: ['check', 'completo', 'listo'],
  cross: ['error', 'cerrar'],
  attachment: ['adjunto'],
  file: ['archivo'],
  idea: ['idea'],
  think: ['pensar'],
  thinking: ['pensando'],
  pray: ['rezar', 'gracias'],
  clap: ['aplauso'],
  cool: ['genial'],
  star: ['estrella'],
  sun: ['sol'],
  moon: ['luna'],
  party: ['fiesta'],
  celebration: ['celebracion'],
  bug: ['error', 'bug'],
  fix: ['arreglo'],
  lock: ['candado', 'seguridad'],
  key: ['llave'],
  money: ['dinero'],
  time: ['tiempo'],
  clock: ['reloj'],
  calendar: ['calendario'],
  phone: ['telefono'],
  email: ['correo'],
  work: ['trabajo'],
  task: ['tarea'],
};

const ES_CATEGORY_MAP: Record<string, string[]> = {
  smileys: ['caras', 'emociones'],
  emotion: ['emocion'],
  people: ['personas'],
  body: ['cuerpo'],
  animals: ['animales'],
  nature: ['naturaleza'],
  food: ['comida'],
  drink: ['bebida'],
  travel: ['viaje'],
  places: ['lugares'],
  activities: ['actividades'],
  objects: ['objetos'],
  symbols: ['simbolos'],
  flags: ['banderas'],
};

function tokenizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function buildSpanishName(nameEn: string): string {
  const words = tokenizeWords(nameEn);
  const translated = words.map((w) => ES_TOKEN_MAP[w]?.[0] || w);
  if (translated.length === 0) return 'Emoji';
  const sentence = translated.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function buildEmojiCatalog(): EmojiOption[] {
  const out: EmojiOption[] = [];
  const seenEmoji = new Set<string>();

  for (const item of gemoji) {
    if (!item?.emoji || seenEmoji.has(item.emoji)) continue;
    seenEmoji.add(item.emoji);

    const englishBaseName = (item.names?.[0] || item.description || 'emoji').replace(/_/g, ' ');
    const tokens = new Set<string>();

    for (const n of item.names || []) tokenizeWords(n).forEach((w) => tokens.add(w));
    for (const t of item.tags || []) tokenizeWords(t).forEach((w) => tokens.add(w));
    tokenizeWords(item.description || '').forEach((w) => tokens.add(w));
    tokenizeWords(item.category || '').forEach((w) => tokens.add(w));

    const esTokens = new Set<string>();
    for (const token of tokens) {
      (ES_TOKEN_MAP[token] || []).forEach((w) => esTokens.add(w));
      (ES_CATEGORY_MAP[token] || []).forEach((w) => esTokens.add(w));
    }

    out.push({
      emoji: item.emoji,
      nameEs: buildSpanishName(englishBaseName),
      nameEn: englishBaseName,
      keywords: Array.from(new Set([...tokens, ...esTokens])),
    });
  }

  return out;
}

export const EMOJI_CATALOG: EmojiOption[] = buildEmojiCatalog();

export function normalizeEmojiSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
