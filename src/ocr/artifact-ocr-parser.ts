import { ArtifactSlot } from '@prisma/client';
import { OcrArtifactResult, OcrSubStatResult } from './dto/ocr-result.dto';

// Mapping of Chinese stat names to system stat names
const STAT_NAME_MAP: Record<string, string> = {
  // Main stats - flat values
  生命值: 'HP',
  攻击力: 'ATK',
  防御力: 'DEF',
  元素精通: 'Elemental Mastery',
  // Percentage stats
  '生命值%': 'HP%',
  '攻击力%': 'ATK%',
  '防御力%': 'DEF%',
  暴击率: 'Crit Rate%',
  暴击伤害: 'Crit DMG%',
  元素充能效率: 'Energy Recharge%',
  治疗加成: 'Healing Bonus%',
  // Elemental damage
  火元素伤害加成: 'Pyro DMG%',
  水元素伤害加成: 'Hydro DMG%',
  雷元素伤害加成: 'Electro DMG%',
  冰元素伤害加成: 'Cryo DMG%',
  风元素伤害加成: 'Anemo DMG%',
  岩元素伤害加成: 'Geo DMG%',
  草元素伤害加成: 'Dendro DMG%',
  物理伤害加成: 'Physical DMG%',
};

// Chinese slot names to slot enum
const SLOT_NAME_MAP: Record<string, ArtifactSlot> = {
  生之花: 'FLOWER',
  死之羽: 'PLUME',
  时之沙: 'SANDS',
  空之杯: 'GOBLET',
  理之冠: 'CIRCLET',
  // Alternative names
  花: 'FLOWER',
  羽: 'PLUME',
  沙: 'SANDS',
  杯: 'GOBLET',
  冠: 'CIRCLET',
};

// Chinese artifact set names to set IDs
const SET_NAME_MAP: Record<string, string> = {
  角斗士的终幕礼: 'gladiators_finale',
  流浪大地的乐团: 'wanderers_troupe',
  昔日宗室之仪: 'noblesse_oblige',
  染血的骑士道: 'bloodstained_chivalry',
  翠绿之影: 'viridescent_venerer',
  炽烈的炎之魔女: 'crimson_witch_of_flames',
  如雷的盛怒: 'thundering_fury',
  冰风迷途的勇士: 'blizzard_strayer',
  沉沦之心: 'heart_of_depth',
  千岩牢固: 'tenacity_of_the_millelith',
  苍白之火: 'pale_flame',
  追忆之注连: 'shimenawas_reminiscence',
  绝缘之旗印: 'emblem_of_severed_fate',
  华馆梦醒形骸记: 'husk_of_opulent_dreams',
  海染砗磲: 'ocean_hued_clam',
  辰砂往生录: 'vermillion_hereafter',
  来歆余响: 'echoes_of_an_offering',
  深林的记忆: 'deepwood_memories',
  饰金之梦: 'gilded_dreams',
  沙上楼阁史话: 'desert_pavilion_chronicle',
  乐园遗落之花: 'flower_of_paradise_lost',
  水仙之梦: 'nymphs_dream',
  花海甘露之光: 'vourukashas_glow',
  逐影猎人: 'marechaussee_hunter',
  黄金剧团: 'golden_troupe',
  昔时之歌: 'song_of_days_past',
  回声之林夜话: 'nighttime_whispers_in_the_echoing_woods',
  谐律异想断章: 'fragment_of_harmonic_whimsy',
  未竟的遐思: 'unfinished_reverie',
  烬城勇者绘卷: 'scroll_of_the_hero_of_cinder_city',
  黑曜秘典: 'obsidian_codex',
  悠古的磐岩: 'archaic_petra',
  逆飞的流星: 'retracing_bolide',
  平息鸣雷的尊者: 'thundersoother',
  渡过烈火的贤人: 'lavawalker',
  被怜爱的少女: 'maiden_beloved',
  战狂: 'berserker',
  教官: 'instructor',
  流放者: 'the_exile',
  行者之心: 'resolution_of_sojourner',
  武人: 'martial_artist',
  守护之心: 'defenders_will',
  奇迹: 'tiny_miracle',
  勇士之心: 'brave_heart',
  赌徒: 'gambler',
  学士: 'scholar',
  游医: 'traveling_doctor',
  幸运儿: 'lucky_dog',
  冒险家: 'adventurer',
};

// Sub stat patterns - match stat name followed by +value
const SUB_STAT_PATTERNS = [
  /[·•]?\s*(生命值|攻击力|防御力|元素精通|元素充能效率|暴击率|暴击伤害)\s*[+＋]?\s*([\d,.]+)%?/g,
];

// Main stat pattern - typically larger value at top
const MAIN_STAT_PATTERNS = [
  /(生命值|攻击力|防御力|元素精通|元素充能效率|暴击率|暴击伤害|治疗加成|火元素伤害加成|水元素伤害加成|雷元素伤害加成|冰元素伤害加成|风元素伤害加成|岩元素伤害加成|草元素伤害加成|物理伤害加成)\s*[+＋]?\s*([\d,.]+)%?/g,
];

// Level pattern
const LEVEL_PATTERN = /[+＋]\s*(\d{1,2})/;

// Rarity detection based on stars
const RARITY_PATTERNS = [/[★☆⭐]{1,5}/, /(\d)\s*星/];

export function parseArtifactOcrText(rawText: string): OcrArtifactResult {
  const lines = rawText.split('\n').filter((line) => line.trim());
  const fullText = rawText.replace(/\s+/g, ' ');

  let setId: string | undefined;
  let setName: string | undefined;
  let slot: ArtifactSlot | undefined;
  let mainStat = 'HP';
  let mainStatValue = 0;
  let level = 0;
  let rarity = 5;
  const subStats: OcrSubStatResult[] = [];
  const confidences: number[] = [];

  // Try to find artifact set name
  for (const [chineseName, id] of Object.entries(SET_NAME_MAP)) {
    if (fullText.includes(chineseName)) {
      setId = id;
      setName = chineseName;
      confidences.push(0.9);
      break;
    }
  }

  // Try to find slot
  for (const [chineseName, slotValue] of Object.entries(SLOT_NAME_MAP)) {
    if (fullText.includes(chineseName)) {
      slot = slotValue;
      confidences.push(0.85);
      break;
    }
  }

  // Find level
  const levelMatch = fullText.match(LEVEL_PATTERN);
  if (levelMatch) {
    level = Math.min(20, Math.max(0, parseInt(levelMatch[1], 10)));
    confidences.push(0.95);
  }

  // Find rarity
  for (const pattern of RARITY_PATTERNS) {
    const rarityMatch = fullText.match(pattern);
    if (rarityMatch) {
      if (rarityMatch[0].includes('★') || rarityMatch[0].includes('☆') || rarityMatch[0].includes('⭐')) {
        rarity = Math.min(5, Math.max(1, rarityMatch[0].length));
      } else if (rarityMatch[1]) {
        rarity = Math.min(5, Math.max(1, parseInt(rarityMatch[1], 10)));
      }
      confidences.push(0.8);
      break;
    }
  }

  // Parse stats - distinguish main stat from sub stats
  // Main stat is usually the first large value encountered
  // Sub stats are prefixed with bullet points or are smaller values
  const allStatMatches: Array<{ stat: string; value: number; isMain: boolean; confidence: number }> = [];

  // Find all stats in text
  for (const pattern of MAIN_STAT_PATTERNS) {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      const statChinese = match[1];
      const valueStr = match[2].replace(/,/g, '');
      const value = parseFloat(valueStr);
      const systemStat = STAT_NAME_MAP[statChinese] || statChinese;

      // Determine if this is a main stat or sub stat based on context
      const fullMatch = match[0];
      const isBulleted = fullMatch.includes('·') || fullMatch.includes('•');
      const isLargeValue = value > 100 && !fullMatch.includes('%');
      const isPercentStat = fullMatch.includes('%') || systemStat.includes('%');

      // Main stat heuristics:
      // - Flat HP/ATK/DEF main stats have large values (1000+)
      // - Percentage main stats have moderate values (7-60%)
      // - Sub stats are bulleted or have smaller values
      let isMain = false;
      let confidence = 0.7;

      if (!isBulleted) {
        if (isLargeValue && !isPercentStat) {
          // Flat main stat (HP/ATK)
          isMain = true;
          confidence = 0.85;
        } else if (isPercentStat && value >= 5 && value <= 70) {
          // Could be main stat percentage
          // Main stats typically: HP%/ATK%/DEF% 7-46.6%, EM 187, CR 31.1%, CD 62.2%
          const isMainStatRange =
            (systemStat === 'HP%' && value >= 7 && value <= 47) ||
            (systemStat === 'ATK%' && value >= 7 && value <= 47) ||
            (systemStat === 'DEF%' && value >= 8.7 && value <= 58.3) ||
            (systemStat === 'Crit Rate%' && value >= 4.7 && value <= 31.1) ||
            (systemStat === 'Crit DMG%' && value >= 9.3 && value <= 62.2) ||
            (systemStat === 'Energy Recharge%' && value >= 7.8 && value <= 51.8) ||
            (systemStat === 'Elemental Mastery' && value >= 28 && value <= 187) ||
            (systemStat === 'Healing Bonus%' && value >= 5.4 && value <= 35.9) ||
            systemStat.includes('DMG%');

          if (isMainStatRange) {
            isMain = true;
            confidence = 0.75;
          }
        }
      }

      allStatMatches.push({ stat: systemStat, value, isMain, confidence });
    }
  }

  // Identify main stat (first non-bulleted stat or largest appropriate value)
  const mainStatMatch = allStatMatches.find((m) => m.isMain);
  if (mainStatMatch) {
    mainStat = mainStatMatch.stat;
    mainStatValue = mainStatMatch.value;
    confidences.push(mainStatMatch.confidence);
  }

  // Collect sub stats (non-main stats)
  for (const statMatch of allStatMatches) {
    if (statMatch.stat !== mainStat && subStats.length < 4) {
      // Validate sub stat value ranges
      const validSubStatValue = validateSubStatValue(statMatch.stat, statMatch.value);
      if (validSubStatValue) {
        subStats.push({
          stat: statMatch.stat,
          value: statMatch.value,
          confidence: statMatch.confidence,
        });
        confidences.push(statMatch.confidence);
      }
    }
  }

  // If no main stat found, infer from slot
  if (!mainStatMatch && slot) {
    switch (slot) {
      case 'FLOWER':
        mainStat = 'HP';
        mainStatValue = 4780; // Max +20 value
        break;
      case 'PLUME':
        mainStat = 'ATK';
        mainStatValue = 311; // Max +20 value
        break;
    }
    confidences.push(0.6);
  }

  // Calculate overall confidence
  const overallConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.5;

  return {
    setId,
    setName,
    slot,
    mainStat,
    mainStatValue,
    subStats,
    level,
    rarity,
    overallConfidence,
    rawText,
  };
}

function validateSubStatValue(stat: string, value: number): boolean {
  // Sub stat max values at +20 with max rolls
  const subStatMaxValues: Record<string, number> = {
    HP: 1794,
    ATK: 117,
    DEF: 139,
    'HP%': 35,
    'ATK%': 35,
    'DEF%': 43.7,
    'Elemental Mastery': 140,
    'Energy Recharge%': 38.9,
    'Crit Rate%': 23.3,
    'Crit DMG%': 46.6,
  };

  const maxValue = subStatMaxValues[stat];
  if (!maxValue) return true; // Unknown stat, allow it

  // Allow some tolerance for OCR errors
  return value > 0 && value <= maxValue * 1.1;
}

export function normalizeStatName(chineseName: string): string {
  return STAT_NAME_MAP[chineseName] || chineseName;
}

export function getSetIdFromName(chineseName: string): string | undefined {
  return SET_NAME_MAP[chineseName];
}
