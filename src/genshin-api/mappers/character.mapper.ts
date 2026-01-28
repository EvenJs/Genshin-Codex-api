import { Element, WeaponType, Prisma } from '@prisma/client';
import { GenshinDevCharacter } from '../interfaces/genshin-dev-character.interface';
import { GENSHIN_API_ENDPOINTS } from '../constants/api-endpoints.constant';

const ELEMENT_MAP: Record<string, Element> = {
  Pyro: Element.PYRO,
  Hydro: Element.HYDRO,
  Anemo: Element.ANEMO,
  Electro: Element.ELECTRO,
  Dendro: Element.DENDRO,
  Cryo: Element.CRYO,
  Geo: Element.GEO,
};

const WEAPON_MAP: Record<string, WeaponType> = {
  Sword: WeaponType.SWORD,
  Claymore: WeaponType.CLAYMORE,
  Polearm: WeaponType.POLEARM,
  Bow: WeaponType.BOW,
  Catalyst: WeaponType.CATALYST,
};

const REGION_MAP: Record<string, string> = {
  Mondstadt: '蒙德',
  Liyue: '璃月',
  Inazuma: '稻妻',
  Sumeru: '须弥',
  Fontaine: '枫丹',
  Natlan: '纳塔',
  Snezhnaya: '至冬',
};

export function mapGenshinDevCharacter(
  id: string,
  data: GenshinDevCharacter,
): Prisma.CharacterCreateInput {
  const element = ELEMENT_MAP[data.vision];
  const weaponType = WEAPON_MAP[data.weapon];

  if (!element) {
    throw new Error(`Unknown element: ${data.vision} for character ${id}`);
  }

  if (!weaponType) {
    throw new Error(`Unknown weapon type: ${data.weapon} for character ${id}`);
  }

  return {
    id,
    name: data.name,
    element,
    weaponType,
    rarity: data.rarity,
    region: REGION_MAP[data.nation] ?? data.nation ?? null,
    imageUrl: `${GENSHIN_API_ENDPOINTS.BASE_URL}/characters/${id}/card`,
  };
}

export function getElementFromVision(vision: string): Element | null {
  return ELEMENT_MAP[vision] ?? null;
}

export function getWeaponTypeFromName(weapon: string): WeaponType | null {
  return WEAPON_MAP[weapon] ?? null;
}

export function getRegionInChinese(nation: string): string {
  return REGION_MAP[nation] ?? nation;
}
