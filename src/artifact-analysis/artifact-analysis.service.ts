import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
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
    language?: string,
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
    let aiResponse: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } | null = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        const result = await this.getAiAnalysis(
          userId,
          artifactForAnalysis,
          characterContext,
          skipCache,
          language,
        );
        aiAnalysis = result?.analysis ?? null;
        aiResponse = result?.response ?? null;
      }
    } catch (error) {
      this.logger.warn(`AI analysis failed, using algorithmic fallback: ${error}`);
    }

    // Merge AI analysis with algorithmic calculations
    const analysisResult = this.buildAnalysisResult(
      artifactId,
      artifactForAnalysis,
      algorithmicScore,
      aiAnalysis,
    );

    const aiResultId = await this.saveAiResult({
      userId,
      accountId,
      artifactId,
      characterId,
      feature: 'ARTIFACT_ANALYSIS',
      input: {
        artifact: artifactForAnalysis,
        characterId,
        skipCache,
      },
      output: analysisResult,
      aiGenerated: Boolean(aiAnalysis),
      language,
      model: aiResponse?.model ?? null,
      promptTokens: aiResponse?.promptTokens ?? null,
      completionTokens: aiResponse?.completionTokens ?? null,
      totalTokens: aiResponse?.totalTokens ?? null,
    });

    return { ...analysisResult, aiResultId };
  }

  /**
   * Batch analyze multiple artifacts
   */
  async batchAnalyze(
    userId: string,
    accountId: string,
    artifactIds: string[],
    characterId?: string,
    language?: string,
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
    let aiResponse: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } | null = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        const result = await this.getAiBatchAnalysis(
          userId,
          artifactsForAnalysis,
          characterContext,
          language,
        );
        aiAnalysis = result?.analysis ?? null;
        aiResponse = result?.response ?? null;
      }
    } catch (error) {
      this.logger.warn(`AI batch analysis failed: ${error}`);
    }

    // Build batch result
    const batchResult = this.buildBatchResult(scoredArtifacts, aiAnalysis, language);

    const aiResultId = await this.saveAiResult({
      userId,
      accountId,
      feature: 'ARTIFACT_BATCH_ANALYSIS',
      input: {
        artifactIds,
        characterId,
      },
      output: batchResult,
      aiGenerated: Boolean(aiAnalysis),
      language,
      model: aiResponse?.model ?? null,
      promptTokens: aiResponse?.promptTokens ?? null,
      completionTokens: aiResponse?.completionTokens ?? null,
      totalTokens: aiResponse?.totalTokens ?? null,
    });

    return { ...batchResult, aiResultId };
  }

  /**
   * Evaluate artifact upgrade potential
   */
  async evaluatePotential(
    userId: string,
    accountId: string,
    artifactId: string,
    language?: string,
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
    let aiResponse: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } | null = null;
    try {
      const isAiAvailable = await this.aiService.isAvailable();
      if (isAiAvailable) {
        const result = await this.getAiPotentialEvaluation(
          userId,
          artifactForAnalysis,
          language,
        );
        aiPotential = result?.analysis ?? null;
        aiResponse = result?.response ?? null;
      }
    } catch (error) {
      this.logger.warn(`AI potential evaluation failed: ${error}`);
    }

    // Calculate upgrade scenarios algorithmically
    const scenarios = this.calculateUpgradeScenarios(artifactForAnalysis, remainingUpgrades);

    const result: PotentialEvaluationResult = {
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

    const aiResultId = await this.saveAiResult({
      userId,
      accountId,
      artifactId,
      feature: 'ARTIFACT_POTENTIAL',
      input: {
        artifact: artifactForAnalysis,
      },
      output: result,
      aiGenerated: Boolean(aiPotential),
      language,
      model: aiResponse?.model ?? null,
      promptTokens: aiResponse?.promptTokens ?? null,
      completionTokens: aiResponse?.completionTokens ?? null,
      totalTokens: aiResponse?.totalTokens ?? null,
    });

    return { ...result, aiResultId };
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
    userId: string,
    artifact: ArtifactForAnalysis,
    characterContext?: CharacterContext,
    skipCache = false,
    language?: string,
  ): Promise<{ analysis: any; response: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } } | null> {
    const prompt = buildArtifactAnalysisPrompt(artifact, characterContext, language);

    try {
      const response = await this.aiService.chatForUser(
        userId,
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3, // Low temperature for consistent analysis
        },
        !skipCache,
      );

      return {
        analysis: this.parseAiResponse(response.content),
        response,
      };
    } catch (error) {
      this.logger.error(`AI analysis error: ${error}`);
      return null;
    }
  }

  /**
   * Get AI batch analysis
   */
  private async getAiBatchAnalysis(
    userId: string,
    artifacts: ArtifactForAnalysis[],
    characterContext?: CharacterContext,
    language?: string,
  ): Promise<{ analysis: any; response: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } } | null> {
    const prompt = buildBatchAnalysisPrompt(artifacts, characterContext, language);

    try {
      const response = await this.aiService.chatForUser(
        userId,
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        true, // Use cache
      );

      return {
        analysis: this.parseAiResponse(response.content),
        response,
      };
    } catch (error) {
      this.logger.error(`AI batch analysis error: ${error}`);
      return null;
    }
  }

  /**
   * Get AI potential evaluation
   */
  private async getAiPotentialEvaluation(
    userId: string,
    artifact: ArtifactForAnalysis,
    language?: string,
  ): Promise<{ analysis: any; response: { model?: string; promptTokens?: number; completionTokens?: number; totalTokens?: number } } | null> {
    const prompt = buildPotentialEvaluationPrompt(artifact, language);

    try {
      const response = await this.aiService.chatForUser(
        userId,
        {
          messages: [
            { role: 'system', content: ARTIFACT_ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        },
        true,
      );

      return {
        analysis: this.parseAiResponse(response.content),
        response,
      };
    } catch (error) {
      this.logger.error(`AI potential evaluation error: ${error}`);
      return null;
    }
  }

  private async saveAiResult(params: {
    userId: string;
    accountId: string;
    artifactId?: string;
    characterId?: string;
    feature: 'ARTIFACT_ANALYSIS' | 'ARTIFACT_BATCH_ANALYSIS' | 'ARTIFACT_POTENTIAL';
    input: unknown;
    output: unknown;
    aiGenerated: boolean;
    language?: string;
    model?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  }): Promise<string> {
    const input = this.toJsonInput(params.input);
    const output = this.toJsonInput(params.output);
    const result = await this.prisma.aiResult.create({
      data: {
        userId: params.userId,
        accountId: params.accountId,
        artifactId: params.artifactId,
        characterId: params.characterId,
        feature: params.feature,
        input,
        output,
        aiGenerated: params.aiGenerated,
        language: params.language,
        model: params.model ?? undefined,
        promptTokens: params.promptTokens ?? undefined,
        completionTokens: params.completionTokens ?? undefined,
        totalTokens: params.totalTokens ?? undefined,
      },
      select: { id: true },
    });

    return result.id;
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
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
    language?: string,
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
    const recommendations = this.generateRecommendations(artifact, algorithmicScore, language);

    // Default suitable characters based on stats
    const suitableCharacters = aiAnalysis?.suitableCharacters || this.suggestCharacters(artifact, language);

    return {
      artifactId,
      overallScore: finalScore,
      grade: finalGrade,
      mainStatAnalysis: aiAnalysis?.mainStatAnalysis || {
        rating: mainStatRating,
        comment: this.getMainStatComment(artifact.slot, artifact.mainStat, mainStatRating, language),
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
        reasoning: this.getPotentialReasoning(artifact, algorithmicScore, language),
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
    language?: string,
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
        keyStrength: aiItem?.keyStrength ?? this.getKeyStrength(a, language),
        keyWeakness: aiItem?.keyWeakness ?? this.getKeyWeakness(a, language),
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
          ? this.t(language, `Prioritize ${completeSets[0]} for set bonus`, `优先考虑${completeSets[0]}来触发套装效果`)
          : this.t(language, 'No complete sets available', '暂无可用的完整套装'),
      },
      overallSuggestion: aiAnalysis?.overallSuggestion || this.generateOverallSuggestion(sorted, language),
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Get key strength of artifact
   */
  private getKeyStrength(artifact: ArtifactForAnalysis, language?: string): string {
    const cv = this.calculateCritValue(artifact.subStats);
    if (cv >= 30) return this.t(language, 'High crit value', '高暴击值');
    if (cv >= 20) return this.t(language, 'Good crit stats', '暴击属性优秀');

    const hasER = artifact.subStats.some((s) => s.stat === 'ER%' || s.stat === 'Energy Recharge%');
    if (hasER) return this.t(language, 'Energy Recharge for burst uptime', '有利于保证大招循环的充能效率');

    const hasEM = artifact.subStats.some((s) => s.stat === 'EM' || s.stat === 'Elemental Mastery');
    if (hasEM) return this.t(language, 'Elemental Mastery for reactions', '元素精通适合反应队');

    return this.t(language, 'Balanced stats', '副词条比较均衡');
  }

  /**
   * Get key weakness of artifact
   */
  private getKeyWeakness(artifact: ArtifactForAnalysis, language?: string): string {
    const weakStats = ['DEF', 'HP', 'DEF%', 'HP%'];
    const wastedRolls = artifact.subStats.filter((s) => weakStats.includes(s.stat));

    if (wastedRolls.length >= 2) {
      return this.t(language, 'Multiple defensive stats', '防御向词条较多');
    }
    if (wastedRolls.length === 1) {
      return this.t(
        language,
        `${wastedRolls[0].stat} taking roll space`,
        `${wastedRolls[0].stat} 占用了有效词条`,
      );
    }

    const cv = this.calculateCritValue(artifact.subStats);
    if (cv < 10) {
      return this.t(language, 'No crit stats', '缺少暴击词条');
    }

    return this.t(language, 'none', '暂无明显短板');
  }

  /**
   * Generate overall suggestion for batch
   */
  private generateOverallSuggestion(sorted: BatchArtifactSummary[], language?: string): string {
    const topArtifact = sorted[0];
    const fodderCount = sorted.filter((a) => a.tier === 'fodder').length;

    if (fodderCount === sorted.length) {
      return this.t(
        language,
        'All artifacts are below average. Continue farming for better pieces.',
        '当前圣遗物整体偏弱，建议继续刷取更好的部件。',
      );
    }

    if (topArtifact.grade === 'S' || topArtifact.grade === 'A') {
      return this.t(
        language,
        `Best piece is a ${topArtifact.grade}-tier artifact. Consider upgrading it first.`,
        `最好的部件为 ${topArtifact.grade} 级，建议优先强化它。`,
      );
    }

    return this.t(
      language,
      `Focus on upgrading the top ${Math.min(3, sorted.length)} pieces while farming for replacements.`,
      `建议先强化前 ${Math.min(3, sorted.length)} 件，同时继续刷取替换。`,
    );
  }

  /**
   * Generate main stat comment
   */
  private getMainStatComment(
    slot: ArtifactSlot,
    mainStat: string,
    rating: string,
    language?: string,
  ): string {
    if (slot === 'FLOWER' || slot === 'PLUME') {
      return this.t(
        language,
        `${mainStat} is the fixed main stat for ${slot}`,
        `${slot}位主词条固定为 ${mainStat}`,
      );
    }

    switch (rating) {
      case 'optimal':
        return this.t(
          language,
          `${mainStat} is an optimal main stat for ${slot}`,
          `${slot}位的最佳主词条之一是 ${mainStat}`,
        );
      case 'good':
        return this.t(language, `${mainStat} is a good choice for most builds`, `${mainStat} 适用于多数配装`);
      case 'acceptable':
        return this.t(language, `${mainStat} works for specific builds`, `${mainStat} 更适合特定配装`);
      default:
        return this.t(language, `${mainStat} is not ideal for most characters`, `${mainStat} 对多数角色并不理想`);
    }
  }

  /**
   * Generate potential reasoning
   */
  private getPotentialReasoning(
    artifact: ArtifactForAnalysis,
    score: { score: number; critValue: number; effectiveRolls: number },
    language?: string,
  ): string {
    if (artifact.level === 20) {
      return this.t(
        language,
        `Fully upgraded. CV: ${score.critValue}, effective rolls: ${score.effectiveRolls}`,
        `已满级。暴击值：${score.critValue}，有效词条：${score.effectiveRolls}`,
      );
    }

    const remainingUpgrades = Math.floor((20 - artifact.level) / 4);
    const hasCrit = artifact.subStats.some(
      (s) => s.stat === 'Crit Rate%' || s.stat === 'Crit DMG%',
    );

    if (hasCrit) {
      return this.t(
        language,
        `${remainingUpgrades} upgrades remaining with crit stats to roll into`,
        `还有 ${remainingUpgrades} 次强化，有暴击词条可期待提升`,
      );
    }
    return this.t(
      language,
      `${remainingUpgrades} upgrades remaining. Limited upside without crit stats`,
      `还有 ${remainingUpgrades} 次强化，但缺少暴击词条，上限有限`,
    );
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    artifact: ArtifactForAnalysis,
    score: { score: number; critValue: number },
    language?: string,
  ): string[] {
    const recommendations: string[] = [];

    if (artifact.level < 20 && score.score >= 30) {
      recommendations.push(this.t(language, 'Upgrade to +20 to unlock full potential', '建议升到 +20 释放全部潜力'));
    }

    if (score.critValue < 20) {
      recommendations.push(this.t(language, 'Look for artifacts with higher crit value', '建议寻找更高暴击值的替代品'));
    }

    const tier = this.scoreTier(score.score);
    if (tier === 'fodder') {
      recommendations.push(this.t(language, 'Consider using as upgrade material', '可以考虑作为强化材料'));
    } else if (tier === 'transitional') {
      recommendations.push(this.t(language, 'Good placeholder while farming better pieces', '可作为过渡装继续刷取'));
    } else {
      recommendations.push(this.t(language, 'Strong endgame piece, worth keeping', '优秀毕业向部件，值得保留'));
    }

    return recommendations;
  }

  /**
   * Suggest suitable characters based on artifact stats
   */
  private suggestCharacters(artifact: ArtifactForAnalysis, language?: string): string[] {
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
      suggestions.push(
        this.t(language, 'Most DPS characters', '多数主C都可使用'),
        this.t(language, 'Check build guides', '可参考配装攻略'),
      );
    }

    return suggestions.slice(0, 3);
  }

  private t(language: string | undefined, en: string, zh: string): string {
    return this.normalizeLanguage(language) === 'en' ? en : zh;
  }

  private normalizeLanguage(language?: string): 'en' | 'zh' {
    if (language?.toLowerCase().startsWith('en')) return 'en';
    return 'zh';
  }
}
