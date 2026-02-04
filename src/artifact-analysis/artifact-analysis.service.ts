import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import {
  ARTIFACT_ANALYSIS_SYSTEM_PROMPT,
  buildArtifactAnalysisPrompt,
  buildBatchAnalysisPrompt,
  buildPotentialEvaluationPrompt,
  ArtifactForAnalysis,
  CharacterContext,
} from '../ai/prompts/artifact-analysis';
import {
  ArtifactAnalysisResult,
  BatchAnalysisResult,
  PotentialEvaluationResult,
  BatchArtifactSummary,
} from './dto';

// Sub-stat name to weight key mapping (same as recommendations service)
const STAT_NAME_TO_KEY: Record<string, string> = {
  'Crit Rate%': 'critRate',
  'Crit DMG%': 'critDmg',
  'ATK': 'atk',
  'ATK%': 'atkPercent',
  'DEF': 'def',
  'DEF%': 'defPercent',
  'HP': 'hp',
  'HP%': 'hpPercent',
  'EM': 'em',
  'Elemental Mastery': 'em',
  'ER%': 'er',
  'Energy Recharge%': 'er',
};

// Maximum possible sub-stat rolls for 5-star artifacts at level 20
const MAX_SUBSTAT_ROLLS: Record<string, number> = {
  critRate: 3.9 * 6,
  critDmg: 7.8 * 6,
  atk: 19.45 * 6,
  atkPercent: 5.83 * 6,
  def: 23.15 * 6,
  defPercent: 7.29 * 6,
  hp: 298.75 * 6,
  hpPercent: 5.83 * 6,
  em: 23.31 * 6,
  er: 6.48 * 6,
};

// Default stat weights for DPS characters
const DEFAULT_STAT_WEIGHTS: Record<string, number> = {
  critRate: 2,
  critDmg: 1,
  atk: 0.1,
  atkPercent: 0.5,
  def: 0,
  defPercent: 0,
  hp: 0,
  hpPercent: 0,
  em: 0.3,
  er: 0.3,
};

// Optimal main stats by slot
const OPTIMAL_MAIN_STATS: Record<ArtifactSlot, string[]> = {
  FLOWER: ['HP'],
  PLUME: ['ATK'],
  SANDS: ['ATK%', 'EM', 'ER%', 'HP%', 'DEF%'],
  GOBLET: ['Pyro DMG%', 'Hydro DMG%', 'Electro DMG%', 'Cryo DMG%', 'Anemo DMG%', 'Geo DMG%', 'Dendro DMG%', 'Physical DMG%', 'ATK%'],
  CIRCLET: ['Crit Rate%', 'Crit DMG%', 'ATK%', 'EM', 'Healing Bonus%', 'HP%', 'DEF%'],
};

interface SubStat {
  stat: string;
  value: number;
}

@Injectable()
export class ArtifactAnalysisService {
  private readonly logger = new Logger(ArtifactAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly ownership: AccountOwnershipService,
  ) {}

  /**
   * Analyze a single artifact with AI enhancement
   */
  async analyzeArtifact(
    userId: string,
    accountId: string,
    artifactId: string,
    characterId?: string,
    skipCache = false,
  ): Promise<ArtifactAnalysisResult> {
    await this.ownership.validate(userId, accountId);

    const artifact = await this.prisma.userArtifact.findFirst({
      where: { id: artifactId, accountId },
      include: {
        set: { select: { id: true, name: true } },
      },
    });

    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    // Get character context if provided
    let characterContext: CharacterContext | undefined;
    if (characterId) {
      const character = await this.prisma.character.findUnique({
        where: { id: characterId },
        select: { name: true, element: true, weaponType: true },
      });
      if (character) {
        characterContext = {
          name: character.name,
          element: character.element,
          weaponType: character.weaponType ?? 'Unknown',
        };
      }
    }

    // Prepare artifact for analysis
    const artifactForAnalysis: ArtifactForAnalysis = {
      slot: artifact.slot,
      setName: artifact.set.name ?? 'Unknown Set',
      mainStat: artifact.mainStat,
      mainStatValue: artifact.mainStatValue,
      subStats: (artifact.subStats as unknown as SubStat[]) ?? [],
      level: artifact.level,
      rarity: artifact.rarity,
    };

    // Calculate base scores using algorithmic approach
    const algorithmicScore = this.calculateAlgorithmicScore(artifactForAnalysis);

    // Try AI analysis, fall back to algorithmic if AI unavailable
    let aiAnalysis: any = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        aiAnalysis = await this.getAiAnalysis(artifactForAnalysis, characterContext, skipCache);
      }
    } catch (error) {
      this.logger.warn(`AI analysis failed, using algorithmic fallback: ${error}`);
    }

    // Merge AI analysis with algorithmic calculations
    return this.buildAnalysisResult(artifactId, artifactForAnalysis, algorithmicScore, aiAnalysis);
  }

  /**
   * Batch analyze multiple artifacts
   */
  async batchAnalyze(
    userId: string,
    accountId: string,
    artifactIds: string[],
    characterId?: string,
  ): Promise<BatchAnalysisResult> {
    await this.ownership.validate(userId, accountId);

    if (artifactIds.length === 0) {
      throw new BadRequestException('No artifact IDs provided');
    }

    if (artifactIds.length > 20) {
      throw new BadRequestException('Maximum 20 artifacts per batch');
    }

    const artifacts = await this.prisma.userArtifact.findMany({
      where: {
        id: { in: artifactIds },
        accountId,
      },
      include: {
        set: { select: { id: true, name: true } },
      },
    });

    if (artifacts.length === 0) {
      throw new NotFoundException('No artifacts found');
    }

    // Get character context if provided
    let characterContext: CharacterContext | undefined;
    if (characterId) {
      const character = await this.prisma.character.findUnique({
        where: { id: characterId },
        select: { name: true, element: true, weaponType: true },
      });
      if (character) {
        characterContext = {
          name: character.name,
          element: character.element,
          weaponType: character.weaponType ?? 'Unknown',
        };
      }
    }

    // Prepare artifacts for analysis
    const artifactsForAnalysis: (ArtifactForAnalysis & { id: string })[] = artifacts.map((a) => ({
      id: a.id,
      slot: a.slot,
      setName: a.set.name ?? 'Unknown Set',
      mainStat: a.mainStat,
      mainStatValue: a.mainStatValue,
      subStats: (a.subStats as unknown as SubStat[]) ?? [],
      level: a.level,
      rarity: a.rarity,
    }));

    // Calculate algorithmic scores
    const scoredArtifacts = artifactsForAnalysis.map((a) => ({
      ...a,
      algorithmicScore: this.calculateAlgorithmicScore(a),
    }));

    // Try AI batch analysis
    let aiAnalysis: any = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        aiAnalysis = await this.getAiBatchAnalysis(
          artifactsForAnalysis,
          characterContext,
        );
      }
    } catch (error) {
      this.logger.warn(`AI batch analysis failed: ${error}`);
    }

    // Build batch result
    return this.buildBatchResult(scoredArtifacts, aiAnalysis);
  }

  /**
   * Evaluate artifact upgrade potential
   */
  async evaluatePotential(
    userId: string,
    accountId: string,
    artifactId: string,
  ): Promise<PotentialEvaluationResult> {
    await this.ownership.validate(userId, accountId);

    const artifact = await this.prisma.userArtifact.findFirst({
      where: { id: artifactId, accountId },
      include: {
        set: { select: { id: true, name: true } },
      },
    });

    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    const artifactForAnalysis: ArtifactForAnalysis = {
      slot: artifact.slot,
      setName: artifact.set.name ?? 'Unknown Set',
      mainStat: artifact.mainStat,
      mainStatValue: artifact.mainStatValue,
      subStats: (artifact.subStats as unknown as SubStat[]) ?? [],
      level: artifact.level,
      rarity: artifact.rarity,
    };

    // Calculate current stats
    const currentScore = this.calculateAlgorithmicScore(artifactForAnalysis);
    const critValue = this.calculateCritValue(artifactForAnalysis.subStats);
    const remainingUpgrades = Math.floor((20 - artifact.level) / 4);

    // Try AI potential evaluation
    let aiPotential: any = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        aiPotential = await this.getAiPotentialEvaluation(artifactForAnalysis);
      }
    } catch (error) {
      this.logger.warn(`AI potential evaluation failed: ${error}`);
    }

    // Calculate upgrade scenarios algorithmically
    const scenarios = this.calculateUpgradeScenarios(artifactForAnalysis, remainingUpgrades);

    return {
      artifactId,
      currentState: {
        score: currentScore.score,
        critValue,
        subStatCount: artifactForAnalysis.subStats.length,
      },
      upgradeScenarios: aiPotential?.upgradeScenarios || {
        bestCase: {
          score: scenarios.bestCase,
          description: 'All rolls into Crit Rate/DMG with high rolls',
        },
        worstCase: {
          score: scenarios.worstCase,
          description: 'All rolls into flat DEF/HP with low rolls',
        },
        averageCase: {
          score: scenarios.averageCase,
          description: 'Mixed rolls with average values',
        },
      },
      recommendation: aiPotential?.recommendation || this.generateUpgradeRecommendation(artifactForAnalysis, scenarios),
      riskAssessment: aiPotential?.riskAssessment || this.assessUpgradeRisk(artifactForAnalysis),
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate algorithmic score for an artifact
   */
  private calculateAlgorithmicScore(artifact: ArtifactForAnalysis): {
    score: number;
    grade: 'S' | 'A' | 'B' | 'C' | 'D';
    critValue: number;
    effectiveRolls: number;
  } {
    const subStats = artifact.subStats || [];
    let totalScore = 0;
    let effectiveRolls = 0;

    // Score sub-stats
    for (const subStat of subStats) {
      const weightKey = STAT_NAME_TO_KEY[subStat.stat];
      const weight = weightKey ? (DEFAULT_STAT_WEIGHTS[weightKey] ?? 0) : 0;
      const maxValue = weightKey ? (MAX_SUBSTAT_ROLLS[weightKey] ?? 100) : 100;

      const normalizedValue = Math.min(subStat.value / maxValue, 1);
      const subScore = normalizedValue * weight * 100;
      totalScore += subScore;

      // Calculate effective rolls (how many upgrades went into this stat)
      if (weightKey && weight > 0) {
        const avgRollValue = maxValue / 6;
        effectiveRolls += subStat.value / avgRollValue;
      }
    }

    // Main stat multiplier
    const mainStatMultiplier = this.getMainStatMultiplier(artifact.slot, artifact.mainStat);
    totalScore *= mainStatMultiplier;

    // Level multiplier
    const levelMultiplier = 0.5 + (artifact.level / 20) * 0.5;
    totalScore *= levelMultiplier;

    // Rarity multiplier
    const rarityMultiplier = artifact.rarity === 5 ? 1 : 0.85;
    totalScore *= rarityMultiplier;

    // Normalize to 0-100 scale
    const normalizedScore = Math.min(Math.round(totalScore / 3), 100);

    // Calculate crit value
    const critValue = this.calculateCritValue(subStats);

    // Determine grade
    const grade = this.scoreToGrade(normalizedScore);

    return {
      score: normalizedScore,
      grade,
      critValue,
      effectiveRolls: Math.round(effectiveRolls * 10) / 10,
    };
  }

  /**
   * Calculate Crit Value (CV = CritRate*2 + CritDmg)
   */
  private calculateCritValue(subStats: SubStat[]): number {
    let cv = 0;
    for (const stat of subStats) {
      if (stat.stat === 'Crit Rate%') {
        cv += stat.value * 2;
      } else if (stat.stat === 'Crit DMG%') {
        cv += stat.value;
      }
    }
    return Math.round(cv * 10) / 10;
  }

  /**
   * Get main stat multiplier based on slot and stat optimality
   */
  private getMainStatMultiplier(slot: ArtifactSlot, mainStat: string): number {
    const optimalStats = OPTIMAL_MAIN_STATS[slot];
    const index = optimalStats.indexOf(mainStat);

    if (slot === 'FLOWER' || slot === 'PLUME') {
      return 1; // Fixed main stats
    }

    if (index === -1) return 0.5;
    if (index === 0) return 1;
    if (index <= 2) return 0.9;
    return 0.7;
  }

  /**
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (score >= 80) return 'S';
    if (score >= 60) return 'A';
    if (score >= 40) return 'B';
    if (score >= 20) return 'C';
    return 'D';
  }

  /**
   * Determine artifact tier
   */
  private scoreTier(score: number): 'endgame' | 'transitional' | 'fodder' {
    if (score >= 60) return 'endgame';
    if (score >= 30) return 'transitional';
    return 'fodder';
  }

  /**
   * Calculate upgrade scenarios
   */
  private calculateUpgradeScenarios(
    artifact: ArtifactForAnalysis,
    remainingUpgrades: number,
  ): { bestCase: number; worstCase: number; averageCase: number } {
    const currentScore = this.calculateAlgorithmicScore(artifact).score;

    if (remainingUpgrades === 0) {
      return { bestCase: currentScore, worstCase: currentScore, averageCase: currentScore };
    }

    // Best case: all crit rolls
    const bestCaseBonus = remainingUpgrades * 8; // ~8 points per crit roll
    const bestCase = Math.min(currentScore + bestCaseBonus, 100);

    // Worst case: all flat def/hp rolls
    const worstCaseBonus = remainingUpgrades * 0.5; // minimal gain
    const worstCase = Math.min(currentScore + worstCaseBonus, 100);

    // Average case: mixed rolls
    const avgCaseBonus = remainingUpgrades * 3;
    const averageCase = Math.min(currentScore + avgCaseBonus, 100);

    return { bestCase, worstCase, averageCase };
  }

  /**
   * Generate upgrade recommendation based on artifact state
   */
  private generateUpgradeRecommendation(
    artifact: ArtifactForAnalysis,
    scenarios: { bestCase: number; worstCase: number; averageCase: number },
  ): {
    shouldUpgrade: boolean;
    priority: 'high' | 'medium' | 'low' | 'skip';
    reasoning: string;
    breakpoint: string;
  } {
    const currentScore = this.calculateAlgorithmicScore(artifact).score;
    const hasCritStats = artifact.subStats.some(
      (s) => s.stat === 'Crit Rate%' || s.stat === 'Crit DMG%',
    );
    const subStatCount = artifact.subStats.length;
    const remainingUpgrades = Math.floor((20 - artifact.level) / 4);

    // Already at +20
    if (remainingUpgrades === 0) {
      return {
        shouldUpgrade: false,
        priority: 'skip',
        reasoning: 'Artifact is already at maximum level.',
        breakpoint: '+20',
      };
    }

    // High priority: Good base with crit stats
    if (hasCritStats && currentScore >= 30 && subStatCount >= 3) {
      return {
        shouldUpgrade: true,
        priority: 'high',
        reasoning: `Strong foundation with crit stats. Average expected score: ${scenarios.averageCase}. Worth investing resources.`,
        breakpoint: 'Continue to +20',
      };
    }

    // Medium priority: Decent artifact
    if (currentScore >= 20 || (subStatCount === 4 && hasCritStats)) {
      return {
        shouldUpgrade: true,
        priority: 'medium',
        reasoning: `Decent artifact with room for improvement. Check rolls at +8 before continuing.`,
        breakpoint: '+8 or +12',
      };
    }

    // Low priority: Questionable investment
    if (currentScore >= 10) {
      return {
        shouldUpgrade: false,
        priority: 'low',
        reasoning: `Below average artifact. Only upgrade if no better options available.`,
        breakpoint: '+4',
      };
    }

    // Skip: Poor artifact
    return {
      shouldUpgrade: false,
      priority: 'skip',
      reasoning: `Poor sub-stat distribution. Use as fodder for better artifacts.`,
      breakpoint: 'Do not upgrade',
    };
  }

  /**
   * Assess upgrade risk
   */
  private assessUpgradeRisk(artifact: ArtifactForAnalysis): {
    level: 'low' | 'medium' | 'high';
    goodRollProbability: string;
    factors: string[];
  } {
    const factors: string[] = [];
    const subStats = artifact.subStats;
    const subStatCount = subStats.length;

    // Count good stats
    const goodStats = ['Crit Rate%', 'Crit DMG%', 'ATK%', 'ER%', 'EM'];
    const goodStatCount = subStats.filter((s) => goodStats.includes(s.stat)).length;

    // Has 4 substats
    if (subStatCount === 4) {
      factors.push('All 4 sub-stats revealed');
    } else {
      factors.push(`Only ${subStatCount} sub-stats (4th will be random)`);
    }

    // Good stat ratio
    const goodRatio = goodStatCount / subStatCount;
    if (goodRatio >= 0.75) {
      factors.push('Most sub-stats are desirable');
    } else if (goodRatio >= 0.5) {
      factors.push('Mixed sub-stat quality');
    } else {
      factors.push('Few desirable sub-stats');
    }

    // Calculate probability
    const probability = Math.round((goodRatio * 100 * subStatCount) / 4);

    // Determine risk level
    let level: 'low' | 'medium' | 'high';
    if (goodRatio >= 0.75 && subStatCount === 4) {
      level = 'low';
    } else if (goodRatio >= 0.5) {
      level = 'medium';
    } else {
      level = 'high';
    }

    return {
      level,
      goodRollProbability: `~${probability}%`,
      factors,
    };
  }

  /**
   * Get AI analysis for a single artifact
   */
  private async getAiAnalysis(
    artifact: ArtifactForAnalysis,
    characterContext?: CharacterContext,
    skipCache = false,
  ): Promise<any> {
    const prompt = buildArtifactAnalysisPrompt(artifact, characterContext);

    try {
      const response = await this.aiService.chat(
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3, // Low temperature for consistent analysis
        },
        !skipCache,
      );

      return this.parseAiResponse(response.content);
    } catch (error) {
      this.logger.error(`AI analysis error: ${error}`);
      return null;
    }
  }

  /**
   * Get AI batch analysis
   */
  private async getAiBatchAnalysis(
    artifacts: ArtifactForAnalysis[],
    characterContext?: CharacterContext,
  ): Promise<any> {
    const prompt = buildBatchAnalysisPrompt(artifacts, characterContext);

    try {
      const response = await this.aiService.chat(
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        true, // Use cache
      );

      return this.parseAiResponse(response.content);
    } catch (error) {
      this.logger.error(`AI batch analysis error: ${error}`);
      return null;
    }
  }

  /**
   * Get AI potential evaluation
   */
  private async getAiPotentialEvaluation(artifact: ArtifactForAnalysis): Promise<any> {
    const prompt = buildPotentialEvaluationPrompt(artifact);

    try {
      const response = await this.aiService.chat(
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        true,
      );

      return this.parseAiResponse(response.content);
    } catch (error) {
      this.logger.error(`AI potential evaluation error: ${error}`);
      return null;
    }
  }

  /**
   * Parse AI response JSON
   */
  private parseAiResponse(content: string): any {
    try {
      // Find JSON in response (might have markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      this.logger.warn(`Failed to parse AI response: ${error}`);
      return null;
    }
  }

  /**
   * Build final analysis result from algorithmic and AI analysis
   */
  private buildAnalysisResult(
    artifactId: string,
    artifact: ArtifactForAnalysis,
    algorithmicScore: {
      score: number;
      grade: 'S' | 'A' | 'B' | 'C' | 'D';
      critValue: number;
      effectiveRolls: number;
    },
    aiAnalysis: any,
  ): ArtifactAnalysisResult {
    // Use AI values if available, otherwise fall back to algorithmic
    const finalScore = aiAnalysis?.overallScore ?? algorithmicScore.score;
    const finalGrade = aiAnalysis?.grade ?? algorithmicScore.grade;

    // Determine main stat rating
    const mainStatMultiplier = this.getMainStatMultiplier(artifact.slot, artifact.mainStat);
    let mainStatRating: 'optimal' | 'good' | 'acceptable' | 'poor';
    if (mainStatMultiplier >= 1) mainStatRating = 'optimal';
    else if (mainStatMultiplier >= 0.9) mainStatRating = 'good';
    else if (mainStatMultiplier >= 0.7) mainStatRating = 'acceptable';
    else mainStatRating = 'poor';

    // Build sub-stat analysis
    const highlights: string[] = [];
    const weakPoints: string[] = [];
    for (const stat of artifact.subStats) {
      const key = STAT_NAME_TO_KEY[stat.stat];
      const weight = key ? (DEFAULT_STAT_WEIGHTS[key] ?? 0) : 0;
      if (weight >= 1) {
        highlights.push(stat.stat);
      } else if (weight === 0) {
        weakPoints.push(stat.stat);
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(artifact, algorithmicScore);

    // Default suitable characters based on stats
    const suitableCharacters = aiAnalysis?.suitableCharacters || this.suggestCharacters(artifact);

    return {
      artifactId,
      overallScore: finalScore,
      grade: finalGrade,
      mainStatAnalysis: aiAnalysis?.mainStatAnalysis || {
        rating: mainStatRating,
        comment: this.getMainStatComment(artifact.slot, artifact.mainStat, mainStatRating),
      },
      subStatAnalysis: aiAnalysis?.subStatAnalysis || {
        critValue: algorithmicScore.critValue,
        rollQuality: algorithmicScore.critValue >= 30 ? 'high' : algorithmicScore.critValue >= 15 ? 'medium' : 'low',
        effectiveRolls: algorithmicScore.effectiveRolls,
        highlights,
        weakPoints,
      },
      potential: aiAnalysis?.potential || {
        currentTier: this.scoreTier(finalScore),
        upgradePriority: finalScore >= 50 ? 'high' : finalScore >= 30 ? 'medium' : 'low',
        expectedScoreAt20: artifact.level < 20 ? Math.min(finalScore + 15, 100) : undefined,
        reasoning: this.getPotentialReasoning(artifact, algorithmicScore),
      },
      suitableCharacters,
      recommendations,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Build batch analysis result
   */
  private buildBatchResult(
    scoredArtifacts: (ArtifactForAnalysis & {
      id: string;
      algorithmicScore: { score: number; grade: 'S' | 'A' | 'B' | 'C' | 'D'; critValue: number; effectiveRolls: number };
    })[],
    aiAnalysis: any,
  ): BatchAnalysisResult {
    // Build artifact summaries
    const artifacts: BatchArtifactSummary[] = scoredArtifacts.map((a, index) => {
      const aiItem = aiAnalysis?.artifacts?.find((ai: any) => ai.index === index + 1);

      return {
        artifactId: a.id,
        index: index + 1,
        score: aiItem?.score ?? a.algorithmicScore.score,
        grade: aiItem?.grade ?? a.algorithmicScore.grade,
        tier: aiItem?.tier ?? this.scoreTier(a.algorithmicScore.score),
        keyStrength: aiItem?.keyStrength ?? this.getKeyStrength(a),
        keyWeakness: aiItem?.keyWeakness ?? this.getKeyWeakness(a),
      };
    });

    // Sort by score
    const sorted = [...artifacts].sort((a, b) => b.score - a.score);
    const ranking = sorted.map((a) => a.artifactId);

    // Analyze sets
    const setCount: Record<string, number> = {};
    for (const a of scoredArtifacts) {
      setCount[a.setName] = (setCount[a.setName] || 0) + 1;
    }
    const completeSets = Object.entries(setCount)
      .filter(([_, count]) => count >= 2)
      .map(([name]) => name);

    return {
      artifacts,
      ranking,
      setAnalysis: aiAnalysis?.setAnalysis || {
        completeSets,
        recommendation: completeSets.length > 0
          ? `Prioritize ${completeSets[0]} for set bonus`
          : 'No complete sets available',
      },
      overallSuggestion: aiAnalysis?.overallSuggestion || this.generateOverallSuggestion(sorted),
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Get key strength of artifact
   */
  private getKeyStrength(artifact: ArtifactForAnalysis): string {
    const cv = this.calculateCritValue(artifact.subStats);
    if (cv >= 30) return 'High crit value';
    if (cv >= 20) return 'Good crit stats';

    const hasER = artifact.subStats.some((s) => s.stat === 'ER%' || s.stat === 'Energy Recharge%');
    if (hasER) return 'Energy Recharge for burst uptime';

    const hasEM = artifact.subStats.some((s) => s.stat === 'EM' || s.stat === 'Elemental Mastery');
    if (hasEM) return 'Elemental Mastery for reactions';

    return 'Balanced stats';
  }

  /**
   * Get key weakness of artifact
   */
  private getKeyWeakness(artifact: ArtifactForAnalysis): string {
    const weakStats = ['DEF', 'HP', 'DEF%', 'HP%'];
    const wastedRolls = artifact.subStats.filter((s) => weakStats.includes(s.stat));

    if (wastedRolls.length >= 2) {
      return 'Multiple defensive stats';
    }
    if (wastedRolls.length === 1) {
      return `${wastedRolls[0].stat} taking roll space`;
    }

    const cv = this.calculateCritValue(artifact.subStats);
    if (cv < 10) {
      return 'No crit stats';
    }

    return 'none';
  }

  /**
   * Generate overall suggestion for batch
   */
  private generateOverallSuggestion(sorted: BatchArtifactSummary[]): string {
    const topArtifact = sorted[0];
    const fodderCount = sorted.filter((a) => a.tier === 'fodder').length;

    if (fodderCount === sorted.length) {
      return 'All artifacts are below average. Continue farming for better pieces.';
    }

    if (topArtifact.grade === 'S' || topArtifact.grade === 'A') {
      return `Best piece is a ${topArtifact.grade}-tier artifact. Consider upgrading it first.`;
    }

    return `Focus on upgrading the top ${Math.min(3, sorted.length)} pieces while farming for replacements.`;
  }

  /**
   * Generate main stat comment
   */
  private getMainStatComment(slot: ArtifactSlot, mainStat: string, rating: string): string {
    if (slot === 'FLOWER' || slot === 'PLUME') {
      return `${mainStat} is the fixed main stat for ${slot}`;
    }

    switch (rating) {
      case 'optimal':
        return `${mainStat} is an optimal main stat for ${slot}`;
      case 'good':
        return `${mainStat} is a good choice for most builds`;
      case 'acceptable':
        return `${mainStat} works for specific builds`;
      default:
        return `${mainStat} is not ideal for most characters`;
    }
  }

  /**
   * Generate potential reasoning
   */
  private getPotentialReasoning(
    artifact: ArtifactForAnalysis,
    score: { score: number; critValue: number; effectiveRolls: number },
  ): string {
    if (artifact.level === 20) {
      return `Fully upgraded. CV: ${score.critValue}, effective rolls: ${score.effectiveRolls}`;
    }

    const remainingUpgrades = Math.floor((20 - artifact.level) / 4);
    const hasCrit = artifact.subStats.some(
      (s) => s.stat === 'Crit Rate%' || s.stat === 'Crit DMG%',
    );

    if (hasCrit) {
      return `${remainingUpgrades} upgrades remaining with crit stats to roll into`;
    }
    return `${remainingUpgrades} upgrades remaining. Limited upside without crit stats`;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    artifact: ArtifactForAnalysis,
    score: { score: number; critValue: number },
  ): string[] {
    const recommendations: string[] = [];

    if (artifact.level < 20 && score.score >= 30) {
      recommendations.push('Upgrade to +20 to unlock full potential');
    }

    if (score.critValue < 20) {
      recommendations.push('Look for artifacts with higher crit value');
    }

    const tier = this.scoreTier(score.score);
    if (tier === 'fodder') {
      recommendations.push('Consider using as upgrade material');
    } else if (tier === 'transitional') {
      recommendations.push('Good placeholder while farming better pieces');
    } else {
      recommendations.push('Strong endgame piece, worth keeping');
    }

    return recommendations;
  }

  /**
   * Suggest suitable characters based on artifact stats
   */
  private suggestCharacters(artifact: ArtifactForAnalysis): string[] {
    const suggestions: string[] = [];

    // Check for specific damage goblets
    if (artifact.mainStat.includes('DMG%')) {
      const element = artifact.mainStat.replace(' DMG%', '');
      const elementCharacters: Record<string, string[]> = {
        Pyro: ['Hu Tao', 'Xiangling', 'Yoimiya'],
        Hydro: ['Yelan', 'Xingqiu', 'Ayato'],
        Electro: ['Raiden Shogun', 'Fischl', 'Yae Miko'],
        Cryo: ['Ayaka', 'Ganyu', 'Shenhe'],
        Anemo: ['Xiao', 'Wanderer', 'Kazuha'],
        Geo: ['Itto', 'Albedo', 'Zhongli'],
        Dendro: ['Alhaitham', 'Nahida', 'Tighnari'],
        Physical: ['Eula', 'Physical Keqing', 'Razor'],
      };
      suggestions.push(...(elementCharacters[element] || []));
    }

    // Check for healing bonus
    if (artifact.mainStat === 'Healing Bonus%') {
      suggestions.push('Barbara', 'Kokomi', 'Jean');
    }

    // Check for HP% main
    if (artifact.mainStat === 'HP%') {
      suggestions.push('Zhongli', 'Hu Tao', 'Yelan');
    }

    // Check for DEF%
    if (artifact.mainStat === 'DEF%') {
      suggestions.push('Itto', 'Albedo', 'Noelle');
    }

    // Check for EM
    if (artifact.mainStat === 'Elemental Mastery' || artifact.mainStat === 'EM') {
      suggestions.push('Kazuha', 'Venti', 'Sucrose');
    }

    // Fallback to generic DPS characters
    if (suggestions.length === 0) {
      suggestions.push('Most DPS characters', 'Check build guides');
    }

    return suggestions.slice(0, 3);
  }
}
