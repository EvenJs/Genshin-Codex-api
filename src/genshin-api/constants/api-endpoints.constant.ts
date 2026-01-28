export const GENSHIN_API_ENDPOINTS = {
  // Primary API: genshin.dev
  BASE_URL: 'https://api.genshin.dev',
  CHARACTERS: 'https://api.genshin.dev/characters',
  CHARACTER_DETAIL: 'https://api.genshin.dev/characters',

  // Fallback API: Gshimpact
  FALLBACK_BASE_URL: 'https://gshimpact.vercel.app',
  FALLBACK_CHARACTERS: 'https://gshimpact.vercel.app/characters',
} as const;

export const CACHE_KEYS = {
  CHARACTER_IDS: 'genshin:characters:ids',
  CHARACTER_DETAIL: (id: string, lang: string) =>
    `genshin:character:${id}:${lang}`,
} as const;

export const CACHE_TTL = {
  CHARACTER_LIST: 3600000, // 1 hour
  CHARACTER_DETAIL: 3600000, // 1 hour
} as const;
