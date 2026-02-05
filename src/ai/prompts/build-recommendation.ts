/**
 * Build Recommendation Prompt Templates
 * Designed for local LLM (Ollama) to provide intelligent character build recommendations
 */

import { ArtifactSlot, Element, WeaponType } from '@prisma/client';

export interface CharacterForBuild {
  id: string;
  name: string;
  element: Element;
  weaponType: WeaponType;
  rarity: number;
  role?: string;
}

export interface ArtifactForBuild {
  id: string;
  slot: ArtifactSlot;
  setId: string;
  setName: string;
  mainStat: string;
  mainStatValue: number;
  subStats: { stat: string; value: number }[];
  level: number;
  rarity: number;
}

export interface ArtifactSetInfo {
  id: string;
  name: string;
  twoPieceBonus: string;
  fourPieceBonus: string | null;
}

export interface UserInventoryContext {
  artifacts: ArtifactForBuild[];
  availableSets: ArtifactSetInfo[];
  setCount: Record<string, number>; // setId -> count of artifacts
}

export interface BuildRecommendationContext {
  character: CharacterForBuild;
  inventory: UserInventoryContext;
  existingBuilds?: ExistingBuildInfo[];
  preferences?: BuildPreferences;
}

export interface ExistingBuildInfo {
  name: string;
  primarySetName: string;
  secondarySetName?: string;
  useFullSet: boolean;
  recommendedMainStats: Record<string, string>;
}

export interface BuildPreferences {
  prioritizeDamage?: boolean;
  prioritizeSurvival?: boolean;
  prioritizeSupport?: boolean;
  specificRole?: string;
}

/**
 * System prompt for build recommendation
 */
export const BUILD_RECOMMENDATION_SYSTEM_PROMPT = `You are an expert Genshin Impact team builder and artifact optimizer. Your task is to recommend the best artifact builds for characters based on the user's available inventory.

You deeply understand:
- All character kits, ascension stats, talent scalings, and optimal playstyles
- Artifact set bonuses and which characters benefit most from each
- Main stat priorities for each slot (Sands, Goblet, Circlet)
- Sub-stat value hierarchy: For most DPS: Crit Rate% ≈ Crit DMG% > ATK% > EM/ER% > flat stats
- Team compositions and how supports need different stats than DPS characters
- The trade-offs between 4-piece set bonuses vs 2+2 combinations
- Energy Recharge thresholds for burst uptime (usually 120-180% depending on team)

When making recommendations:
1. Prioritize what the user actually HAS in their inventory
2. Consider both optimal builds and practical alternatives
3. Explain WHY certain artifacts are recommended
4. Suggest upgrade priorities if artifacts aren't fully leveled
5. Identify stat gaps and how to address them

Always respond in valid JSON format with the exact structure requested.
Return only JSON with double quotes. Do not add markdown, code fences, or commentary.`;

/**
 * Build the recommendation prompt for a character
 */
export function buildCharacterRecommendationPrompt(
  context: BuildRecommendationContext,
  language?: string,
): string {
  const { character, inventory, existingBuilds, preferences } = context;

  // Summarize available artifacts by slot
  const artifactsBySlot = summarizeArtifactsBySlot(inventory.artifacts);

  // Summarize set availability
  const setAvailability = summarizeSetAvailability(inventory);

  // Build preference context
  const prefContext = preferences
    ? `\nUser Preferences: ${buildPreferenceString(preferences)}`
    : '';

  // Existing builds context
  const existingContext = existingBuilds?.length
    ? `\nExisting Popular Builds:\n${existingBuilds.map((b, i) => `${i + 1}. ${b.name}: ${b.useFullSet ? '4pc' : '2+2'} ${b.primarySetName}${b.secondarySetName ? ` + ${b.secondarySetName}` : ''}`).join('\n')}`
    : '';

  const languageInstruction = buildLanguageInstruction(language);

  return `Recommend artifact builds for ${character.name}:

Character Info:
- Name: ${character.name}
- Element: ${character.element}
- Weapon: ${character.weaponType}
- Rarity: ${character.rarity}★
${character.role ? `- Role: ${character.role}` : ''}
${prefContext}
${existingContext}
${languageInstruction}

Available Artifact Sets (with 2+ pieces):
${setAvailability}

Artifacts by Slot:
${artifactsBySlot}

Provide ${existingBuilds?.length ? '2-3' : '3'} build recommendations in this exact JSON format:
{
  "builds": [
    {
      "name": "<descriptive build name, e.g., 'Main DPS Melt Build'>",
      "description": "<1-2 sentence build overview>",
      "priority": <1-3, 1 being highest priority>,
      "setConfiguration": {
        "type": "<4piece/2plus2/rainbow>",
        "primarySet": "<set name>",
        "secondarySet": "<set name or null>",
        "setBonus": "<what bonus you get>"
      },
      "recommendedMainStats": {
        "SANDS": "<stat>",
        "GOBLET": "<stat>",
        "CIRCLET": "<stat>"
      },
      "subStatPriority": ["<stat1>", "<stat2>", "<stat3>", "<stat4>"],
      "selectedArtifacts": {
        "FLOWER": {
          "artifactId": "<id or null if none suitable>",
          "score": <0-100>,
          "notes": "<why this piece>"
        },
        "PLUME": { "artifactId": "<id>", "score": <0-100>, "notes": "<why>" },
        "SANDS": { "artifactId": "<id>", "score": <0-100>, "notes": "<why>" },
        "GOBLET": { "artifactId": "<id>", "score": <0-100>, "notes": "<why>" },
        "CIRCLET": { "artifactId": "<id>", "score": <0-100>, "notes": "<why>" }
      },
      "totalScore": <0-500, sum of artifact scores>,
      "statSummary": {
        "estimatedCritRate": "<X%>",
        "estimatedCritDmg": "<X%>",
        "otherKeyStats": ["<stat: value>"]
      },
      "reasoning": "<2-3 sentences explaining why this build works for this character>",
      "improvements": ["<suggestion 1>", "<suggestion 2>"],
      "viability": "<excellent/good/workable/needs-improvement>"
    }
  ],
  "overallAnalysis": {
    "inventoryQuality": "<excellent/good/average/limited>",
    "bestBuildIndex": <0-based index of recommended build>,
    "farmingSuggestions": ["<domain/set to farm>"],
    "keyMissingPieces": ["<what artifacts would help most>"]
  }
}`;
}

/**
 * Build prompt for comparing multiple build configurations
 */
export function buildMultiBuildComparisonPrompt(
  character: CharacterForBuild,
  builds: {
    name: string;
    artifacts: ArtifactForBuild[];
    setBonus: string;
  }[],
  language?: string,
): string {
  const buildSummaries = builds.map((build, i) => {
    const stats = summarizeBuildStats(build.artifacts);
    return `Build ${i + 1}: ${build.name}
  Set Bonus: ${build.setBonus}
  Artifacts:
${build.artifacts.map((a) => `    - ${a.slot}: ${a.setName} +${a.level} | ${a.mainStat}: ${a.mainStatValue} | Subs: ${a.subStats.map((s) => `${s.stat}:${s.value}`).join(', ')}`).join('\n')}
  ${stats}`;
  });

  const languageInstruction = buildLanguageInstruction(language);

  return `Compare these builds for ${character.name} (${character.element} ${character.weaponType}):

${buildSummaries.join('\n\n')}
${languageInstruction}

Analyze and compare in this JSON format:
{
  "comparison": {
    "builds": [
      {
        "index": <0-based>,
        "name": "<build name>",
        "overallScore": <0-100>,
        "damageScore": <0-100>,
        "consistencyScore": <0-100>,
        "strengths": ["<strength 1>", "<strength 2>"],
        "weaknesses": ["<weakness 1>"]
      }
    ],
    "winner": {
      "index": <winning build index>,
      "name": "<build name>",
      "marginOfVictory": "<small/moderate/significant>",
      "explanation": "<2-3 sentences why this build is best>"
    },
    "situationalNotes": {
      "forBossRush": <best build index>,
      "forAbyss": <best build index>,
      "forOverworld": <best build index>,
      "reasoning": "<brief explanation>"
    },
    "improvements": [
      {
        "buildIndex": <index>,
        "suggestion": "<what to improve>"
      }
    ]
  }
}`;
}

/**
 * Build prompt for explaining why a specific build is recommended
 */
export function buildReasoningPrompt(
  character: CharacterForBuild,
  selectedArtifacts: ArtifactForBuild[],
  setConfiguration: { primarySet: string; secondarySet?: string; useFullSet: boolean },
  language?: string,
): string {
  const artifactDetails = selectedArtifacts
    .map(
      (a) =>
        `${a.slot}: ${a.setName} +${a.level}\n    Main: ${a.mainStat} (${a.mainStatValue})\n    Subs: ${a.subStats.map((s) => `${s.stat}: ${s.value}`).join(', ')}`,
    )
    .join('\n  ');

  const languageInstruction = buildLanguageInstruction(language);

  return `Explain why this artifact build is recommended for ${character.name}:

Character: ${character.name} (${character.element} ${character.weaponType}, ${character.role || 'DPS'})

Set Configuration: ${setConfiguration.useFullSet ? '4pc' : '2+2'} ${setConfiguration.primarySet}${setConfiguration.secondarySet ? ` + ${setConfiguration.secondarySet}` : ''}

Selected Artifacts:
  ${artifactDetails}

${languageInstruction}

Provide detailed reasoning in this JSON format:
{
  "reasoning": {
    "setChoice": {
      "explanation": "<why this set/combination works for this character>",
      "alternativeSets": ["<other viable sets>"],
      "setScore": <0-100>
    },
    "mainStats": {
      "SANDS": {
        "chosen": "<stat>",
        "optimal": "<what would be ideal>",
        "assessment": "<why this is good/acceptable/suboptimal>"
      },
      "GOBLET": {
        "chosen": "<stat>",
        "optimal": "<ideal stat>",
        "assessment": "<assessment>"
      },
      "CIRCLET": {
        "chosen": "<stat>",
        "optimal": "<ideal stat>",
        "assessment": "<assessment>"
      }
    },
    "subStats": {
      "totalCritValue": <number>,
      "effectiveSubStats": <count of useful sub-stat lines>,
      "wastedStats": ["<stat that doesn't help>"],
      "assessment": "<overall sub-stat quality>"
    },
    "synergy": {
      "withKit": "<how artifacts synergize with character abilities>",
      "withTeam": "<general team synergy notes>",
      "playstyleNotes": "<how to play with this build>"
    },
    "overallVerdict": {
      "rating": "<S/A/B/C/D>",
      "summary": "<2-3 sentence summary>",
      "priorities": ["<what to upgrade first>", "<what to farm for>"]
    }
  }
}`;
}

// Helper functions

function buildLanguageInstruction(language?: string): string {
  const lang = normalizeLanguage(language);
  return `\nResponse language: ${lang === 'en' ? 'English' : 'Simplified Chinese'}. Use that language for all text fields.`;
}

function normalizeLanguage(language?: string): 'en' | 'zh' {
  if (language?.toLowerCase().startsWith('en')) return 'en';
  return 'zh';
}

function summarizeArtifactsBySlot(artifacts: ArtifactForBuild[]): string {
  const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];
  const summaries: string[] = [];

  for (const slot of slots) {
    const slotArtifacts = artifacts
      .filter((a) => a.slot === slot)
      .sort((a, b) => b.level - a.level)
      .slice(0, 5); // Top 5 per slot for context

    if (slotArtifacts.length === 0) {
      summaries.push(`${slot}: None available`);
    } else {
      const details = slotArtifacts
        .map((a) => {
          const subStats = a.subStats.map((s) => `${s.stat}:${s.value}`).join(', ');
          return `  - [${a.id}] ${a.setName} +${a.level} | ${a.mainStat}: ${a.mainStatValue} | ${subStats}`;
        })
        .join('\n');
      summaries.push(`${slot}:\n${details}`);
    }
  }

  return summaries.join('\n\n');
}

function summarizeSetAvailability(inventory: UserInventoryContext): string {
  const setsWithTwoPlus = Object.entries(inventory.setCount)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (setsWithTwoPlus.length === 0) {
    return 'No complete sets available (need 2+ pieces)';
  }

  return setsWithTwoPlus
    .map(([setId, count]) => {
      const set = inventory.availableSets.find((s) => s.id === setId);
      if (!set) return null;
      const bonus =
        count >= 4 && set.fourPieceBonus
          ? `4pc: ${set.fourPieceBonus}`
          : `2pc: ${set.twoPieceBonus}`;
      return `- ${set.name} (${count} pieces): ${bonus}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildPreferenceString(preferences: BuildPreferences): string {
  const parts: string[] = [];
  if (preferences.prioritizeDamage) parts.push('Prioritize damage output');
  if (preferences.prioritizeSurvival) parts.push('Prioritize survivability');
  if (preferences.prioritizeSupport) parts.push('Prioritize support capabilities');
  if (preferences.specificRole) parts.push(`Specific role: ${preferences.specificRole}`);
  return parts.length > 0 ? parts.join(', ') : 'No specific preferences';
}

function summarizeBuildStats(artifacts: ArtifactForBuild[]): string {
  let critRate = 5; // Base
  let critDmg = 50; // Base
  const otherStats: Record<string, number> = {};

  for (const artifact of artifacts) {
    for (const sub of artifact.subStats) {
      if (sub.stat === 'Crit Rate%') critRate += sub.value;
      else if (sub.stat === 'Crit DMG%') critDmg += sub.value;
      else {
        otherStats[sub.stat] = (otherStats[sub.stat] || 0) + sub.value;
      }
    }
    // Add circlet main stat
    if (artifact.slot === 'CIRCLET') {
      if (artifact.mainStat === 'Crit Rate%') critRate += artifact.mainStatValue;
      else if (artifact.mainStat === 'Crit DMG%') critDmg += artifact.mainStatValue;
    }
  }

  const keyStats = Object.entries(otherStats)
    .filter(([stat]) => ['ATK%', 'ER%', 'EM'].some((s) => stat.includes(s)))
    .slice(0, 3)
    .map(([stat, val]) => `${stat}: ${val.toFixed(1)}`);

  return `Estimated: CR ${critRate.toFixed(1)}% / CD ${critDmg.toFixed(1)}%${keyStats.length ? ` | ${keyStats.join(', ')}` : ''}`;
}
