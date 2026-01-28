export interface GenshinDevSkillTalent {
  name: string;
  unlock: string;
  description: string;
  type: string;
}

export interface GenshinDevPassiveTalent {
  name: string;
  unlock: string;
  description: string;
}

export interface GenshinDevConstellation {
  name: string;
  unlock: string;
  description: string;
  level: number;
}

export interface GenshinDevCharacter {
  name: string;
  title: string;
  vision: string;
  weapon: string;
  gender: string;
  nation: string;
  affiliation: string;
  rarity: number;
  release: string;
  constellation: string;
  birthday: string;
  description: string;
  skillTalents?: GenshinDevSkillTalent[];
  passiveTalents?: GenshinDevPassiveTalent[];
  constellations?: GenshinDevConstellation[];
}

export interface GshimpactCharacter {
  id: string;
  name: string;
  rarity: number;
  vision: string;
  weapon: string;
  region: string;
  model_type: string;
}

export interface GshimpactResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
