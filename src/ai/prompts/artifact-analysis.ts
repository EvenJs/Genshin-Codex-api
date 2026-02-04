/**
 * Artifact Analysis Prompt Templates
 * Designed for local LLM (Ollama) to analyze Genshin Impact artifacts
 */

import { ArtifactSlot } from '@prisma/client';

export interface ArtifactForAnalysis {
  slot: ArtifactSlot;
  setName: string;
  mainStat: string;
  mainStatValue: number;
  subStats: { stat: string; value: number }[];
  level: number;
  rarity: number;
}

export interface CharacterContext {
  name: string;
  element: string;
  weaponType: string;
  role?: string;
}

/**
 * System prompt for artifact analysis
 */
export const ARTIFACT_ANALYSIS_SYSTEM_PROMPT = `You are an expert Genshin Impact artifact analyzer. Your task is to evaluate artifacts and provide actionable insights.

You understand:
- Artifact slots: Flower (HP), Plume (ATK), Sands (ATK%/HP%/DEF%/EM/ER%), Goblet (Elemental DMG%/Physical DMG%/ATK%/HP%/DEF%/EM), Circlet (Crit Rate%/Crit DMG%/ATK%/HP%/DEF%/EM/Healing Bonus%)
- Sub-stat value ranges for 5-star artifacts per roll: Crit Rate ~3.1-3.9%, Crit DMG ~6.2-7.8%, ATK%/HP%/DEF% ~4.7-5.8%, EM ~16-23, ER% ~5.2-6.5%, flat ATK/DEF ~14-19, flat HP ~239-299
- Sub-stat importance hierarchy: For most DPS characters: Crit Rate% ≈ Crit DMG% > ATK% > EM/ER% > flat stats
- Set bonuses and their synergies with different character archetypes

Always respond in valid JSON format with the exact structure requested.`;

/**
 * Build the analysis prompt for a single artifact
 */
export function buildArtifactAnalysisPrompt(
  artifact: ArtifactForAnalysis,
  targetCharacter?: CharacterContext,
): string {
  const subStatsText = artifact.subStats
    .map((s) => `  - ${s.stat}: ${s.value}`)
    .join('\n');

  const characterContext = targetCharacter
    ? `\nTarget Character: ${targetCharacter.name} (${targetCharacter.element} ${targetCharacter.weaponType}${targetCharacter.role ? `, ${targetCharacter.role}` : ''})`
    : '';

  return `Analyze this ${artifact.rarity}-star ${artifact.setName} artifact:

Slot: ${artifact.slot}
Level: +${artifact.level}
Main Stat: ${artifact.mainStat} (${artifact.mainStatValue})
Sub-Stats:
${subStatsText}
${characterContext}

Provide analysis in this exact JSON format:
{
  "overallScore": <number 0-100>,
  "grade": "<S/A/B/C/D>",
  "mainStatAnalysis": {
    "rating": "<optimal/good/acceptable/poor>",
    "comment": "<brief explanation>"
  },
  "subStatAnalysis": {
    "critValue": <number, sum of CritRate*2 + CritDmg>,
    "rollQuality": "<high/medium/low>",
    "effectiveRolls": <number, estimated effective sub-stat rolls>,
    "highlights": ["<stat that rolled well>"],
    "weakPoints": ["<wasted or low-value stats>"]
  },
  "potential": {
    "currentTier": "<endgame/transitional/fodder>",
    "upgradePriority": "<high/medium/low/skip>",
    "expectedScoreAt20": <number 0-100 if not at +20>,
    "reasoning": "<1-2 sentences>"
  },
  "suitableCharacters": ["<character name 1>", "<character name 2>", "<character name 3>"],
  "recommendations": ["<actionable suggestion 1>", "<actionable suggestion 2>"]
}`;
}

/**
 * Build prompt for batch artifact analysis
 */
export function buildBatchAnalysisPrompt(
  artifacts: ArtifactForAnalysis[],
  characterContext?: CharacterContext,
): string {
  const artifactSummaries = artifacts.map((a, i) => {
    const subStats = a.subStats.map((s) => `${s.stat}:${s.value}`).join(', ');
    return `${i + 1}. [${a.slot}] ${a.setName} +${a.level} | ${a.mainStat}: ${a.mainStatValue} | Subs: ${subStats}`;
  });

  const charContext = characterContext
    ? `For: ${characterContext.name} (${characterContext.element} ${characterContext.weaponType})`
    : 'General evaluation';

  return `Analyze these ${artifacts.length} artifacts. ${charContext}

${artifactSummaries.join('\n')}

Provide analysis in this JSON format:
{
  "artifacts": [
    {
      "index": 1,
      "score": <0-100>,
      "grade": "<S/A/B/C/D>",
      "tier": "<endgame/transitional/fodder>",
      "keyStrength": "<main strength>",
      "keyWeakness": "<main weakness or 'none'>"
    }
  ],
  "ranking": [<indices sorted by score, best first>],
  "setAnalysis": {
    "completeSets": ["<set names with 2+ pieces>"],
    "recommendation": "<which set bonus to prioritize>"
  },
  "overallSuggestion": "<1-2 sentences on what to improve>"
}`;
}

/**
 * Build prompt for potential/upgrade evaluation
 */
export function buildPotentialEvaluationPrompt(artifact: ArtifactForAnalysis): string {
  const subStatsText = artifact.subStats
    .map((s) => `  - ${s.stat}: ${s.value}`)
    .join('\n');

  const remainingUpgrades = Math.floor((20 - artifact.level) / 4);

  return `Evaluate the upgrade potential of this artifact:

Set: ${artifact.setName}
Slot: ${artifact.slot}
Rarity: ${artifact.rarity}-star
Current Level: +${artifact.level} (${remainingUpgrades} upgrades remaining)
Main Stat: ${artifact.mainStat}
Current Sub-Stats:
${subStatsText}

Analyze in this JSON format:
{
  "currentState": {
    "score": <0-100>,
    "critValue": <CV calculation>,
    "subStatCount": ${artifact.subStats.length}
  },
  "upgradeScenarios": {
    "bestCase": {
      "score": <0-100>,
      "description": "<what would happen if all rolls go to best stats>"
    },
    "worstCase": {
      "score": <0-100>,
      "description": "<what would happen if all rolls go to worst stats>"
    },
    "averageCase": {
      "score": <0-100>,
      "description": "<realistic expected outcome>"
    }
  },
  "recommendation": {
    "shouldUpgrade": <true/false>,
    "priority": "<high/medium/low/skip>",
    "reasoning": "<2-3 sentences explaining the decision>",
    "breakpoint": "<level at which to stop if rolls go poorly, e.g. '+8' or 'continue to +20'>"
  },
  "riskAssessment": {
    "level": "<low/medium/high>",
    "goodRollProbability": "<percentage estimate>",
    "factors": ["<risk factor 1>", "<risk factor 2>"]
  }
}`;
}

/**
 * Build prompt for character-specific artifact evaluation
 */
export function buildCharacterFitPrompt(
  artifact: ArtifactForAnalysis,
  character: CharacterContext,
  buildType?: string,
): string {
  const subStatsText = artifact.subStats
    .map((s) => `  - ${s.stat}: ${s.value}`)
    .join('\n');

  return `Evaluate how well this artifact fits ${character.name}:

Character: ${character.name}
Element: ${character.element}
Weapon: ${character.weaponType}
${character.role ? `Role: ${character.role}` : ''}
${buildType ? `Build Type: ${buildType}` : ''}

Artifact:
Set: ${artifact.setName}
Slot: ${artifact.slot}
Main Stat: ${artifact.mainStat} (${artifact.mainStatValue})
Level: +${artifact.level}
Sub-Stats:
${subStatsText}

Analyze in this JSON format:
{
  "fitScore": <0-100, how well this artifact fits this character>,
  "fitGrade": "<S/A/B/C/D>",
  "mainStatFit": {
    "isOptimal": <true/false>,
    "explanation": "<why this main stat is or isn't good for this character>"
  },
  "subStatFit": {
    "usefulStats": ["<stats this character benefits from>"],
    "wastedStats": ["<stats this character doesn't use>"],
    "utilization": "<percentage of sub-stat value this character can use>"
  },
  "setBonus": {
    "isRecommended": <true/false>,
    "synergy": "<how well this set works with the character's kit>"
  },
  "verdict": {
    "recommendation": "<use/consider/replace>",
    "reasoning": "<2-3 sentences>",
    "alternatives": ["<better artifact options if applicable>"]
  }
}`;
}
