import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import {
  BUILD_RECOMMENDATION_SYSTEM_PROMPT,
  buildCharacterRecommendationPrompt,
  buildMultiBuildComparisonPrompt,
  buildReasoningPrompt,
  type CharacterForBuild,
  type ArtifactForBuild,
  type ArtifactSetInfo,
  type UserInventoryContext,
  type BuildRecommendationContext,
  type ExistingBuildInfo,
  type BuildPreferences,
} from './prompts/build-recommendation';

// Response types
export interface BuildArtifactSelection {
  artifactId: string | null;
  score: number;
  notes: string;
}

export interface RecommendedBuild {
  name: string;
  description: string;
  priority: number;
  setConfiguration: {
    type: '4piece' | '2plus2' | 'rainbow';
    primarySet: string;
    secondarySet: string | null;
    setBonus: string;
  };
  recommendedMainStats: {
    SANDS: string;
    GOBLET: string;
    CIRCLET: string;
  };
  subStatPriority: string[];
  selectedArtifacts: {
    FLOWER: BuildArtifactSelection;
    PLUME: BuildArtifactSelection;
    SANDS: BuildArtifactSelection;
    GOBLET: BuildArtifactSelection;
    CIRCLET: BuildArtifactSelection;
  };
  totalScore: number;
  statSummary: {
    estimatedCritRate: string;
    estimatedCritDmg: string;
    otherKeyStats: string[];
  };
  reasoning: string;
  improvements: string[];
  viability: 'excellent' | 'good' | 'workable' | 'needs-improvement';
}

export interface OverallAnalysis {
  inventoryQuality: 'excellent' | 'good' | 'average' | 'limited';
  bestBuildIndex: number;
  farmingSuggestions: string[];
  keyMissingPieces: string[];
}

export interface AiBuildRecommendationResult {
  character: CharacterForBuild;
  builds: RecommendedBuild[];
  overallAnalysis: OverallAnalysis;
  generatedAt: string;
  aiGenerated: boolean;
}

export interface BuildComparisonResult {
  comparison: {
    builds: {
      index: number;
      name: string;
      overallScore: number;
      damageScore: number;
      consistencyScore: number;
      strengths: string[];
      weaknesses: string[];
    }[];
    winner: {
      index: number;
      name: string;
      marginOfVictory: 'small' | 'moderate' | 'significant';
      explanation: string;
    };
    situationalNotes: {
      forBossRush: number;
      forAbyss: number;
      forOverworld: number;
      reasoning: string;
    };
    improvements: {
      buildIndex: number;
      suggestion: string;
    }[];
  };
}

export interface BuildReasoningResult {
  reasoning: {
    setChoice: {
      explanation: string;
      alternativeSets: string[];
      setScore: number;
    };
    mainStats: {
      SANDS: { chosen: string; optimal: string; assessment: string };
      GOBLET: { chosen: string; optimal: string; assessment: string };
      CIRCLET: { chosen: string; optimal: string; assessment: string };
    };
    subStats: {
      totalCritValue: number;
      effectiveSubStats: number;
      wastedStats: string[];
      assessment: string;
    };
    synergy: {
      withKit: string;
      withTeam: string;
      playstyleNotes: string;
    };
    overallVerdict: {
      rating: 'S' | 'A' | 'B' | 'C' | 'D';
      summary: string;
      priorities: string[];
    };
  };
}

export interface AiRecommendDto {
  preferences?: BuildPreferences;
  skipCache?: boolean;
}

export interface CompareBuildsDto {
  buildConfigs: {
    name: string;
    artifactIds: string[];
  }[];
}

@Injectable()
export class BuildRecommendationService {
  private readonly logger = new Logger(BuildRecommendationService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly ownership: AccountOwnershipService,
  ) {}

  /**
   * Get AI-powered build recommendations for a character
   */
  async getRecommendations(
    userId: string,
    accountId: string,
    characterId: string,
    dto: AiRecommendDto = {},
  ): Promise<AiBuildRecommendationResult> {
    // Validate ownership
    await this.ownership.validate(userId, accountId);

    // Get character info
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        role: true,
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    // Get user's artifacts
    const artifacts = await this.getUserArtifacts(accountId);

    // Get available artifact sets
    const availableSets = await this.getAvailableSets(artifacts);

    // Count artifacts per set
    const setCount = this.countArtifactsBySet(artifacts);

    // Get existing popular builds for this character
    const existingBuilds = await this.getExistingBuilds(characterId);

    // Build context for AI
    const context: BuildRecommendationContext = {
      character: {
        id: character.id,
        name: character.name,
        element: character.element ?? 'ANEMO',
        weaponType: character.weaponType ?? 'SWORD',
        rarity: character.rarity ?? 5,
        role: character.role || undefined,
      },
      inventory: {
        artifacts: artifacts.map(this.mapArtifactForBuild),
        availableSets,
        setCount,
      },
      existingBuilds,
      preferences: dto.preferences,
    };

    // Check AI availability
    const aiAvailable = await this.aiService.isAvailable();

    if (!aiAvailable) {
      // Fallback to algorithmic recommendation
      return this.generateAlgorithmicRecommendation(context);
    }

    // Generate AI recommendation
    try {
      const prompt = buildCharacterRecommendationPrompt(context);

      const response = await this.aiService.chat(
        {
          messages: [
            { role: 'system', content: BUILD_RECOMMENDATION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3, // Lower temperature for more consistent recommendations
        },
        !dto.skipCache,
      );

      const parsed = this.parseAiResponse<{ builds: RecommendedBuild[]; overallAnalysis: OverallAnalysis }>(
        response.content,
      );

      return {
        character: context.character,
        builds: parsed.builds,
        overallAnalysis: parsed.overallAnalysis,
        generatedAt: new Date().toISOString(),
        aiGenerated: true,
      };
    } catch (error) {
      this.logger.warn(`AI recommendation failed, falling back to algorithmic: ${error}`);
      return this.generateAlgorithmicRecommendation(context);
    }
  }

  /**
   * Compare multiple build configurations
   */
  async compareBuilds(
    userId: string,
    accountId: string,
    characterId: string,
    dto: CompareBuildsDto,
  ): Promise<BuildComparisonResult> {
    // Validate ownership
    await this.ownership.validate(userId, accountId);

    // Get character
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        role: true,
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    // Fetch artifacts for each build
    const builds = await Promise.all(
      dto.buildConfigs.map(async (config) => {
        const artifacts = await this.prisma.userArtifact.findMany({
          where: {
            id: { in: config.artifactIds },
            accountId,
          },
          include: { set: true },
        });

        const setBonus = this.calculateSetBonus(artifacts);

        return {
          name: config.name,
          artifacts: artifacts.map(this.mapArtifactForBuild),
          setBonus,
        };
      }),
    );

    // Check AI availability
    const aiAvailable = await this.aiService.isAvailable();

    if (!aiAvailable) {
      // Fallback to algorithmic comparison
      return this.generateAlgorithmicComparison(character, builds);
    }

    try {
      const prompt = buildMultiBuildComparisonPrompt(
        {
          id: character.id,
          name: character.name,
          element: character.element ?? 'ANEMO',
          weaponType: character.weaponType ?? 'SWORD',
          rarity: character.rarity ?? 5,
          role: character.role || undefined,
        },
        builds,
      );

      const response = await this.aiService.chat({
        messages: [
          { role: 'system', content: BUILD_RECOMMENDATION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      return this.parseAiResponse<BuildComparisonResult>(response.content);
    } catch (error) {
      this.logger.warn(`AI comparison failed, falling back to algorithmic: ${error}`);
      return this.generateAlgorithmicComparison(character, builds);
    }
  }

  /**
   * Generate detailed reasoning for a specific build
   */
  async generateReasoning(
    userId: string,
    accountId: string,
    characterId: string,
    artifactIds: string[],
  ): Promise<BuildReasoningResult> {
    // Validate ownership
    await this.ownership.validate(userId, accountId);

    // Get character
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    // Get artifacts
    const artifacts = await this.prisma.userArtifact.findMany({
      where: {
        id: { in: artifactIds },
        accountId,
      },
      include: { set: true },
    });

    if (artifacts.length === 0) {
      throw new NotFoundException('No valid artifacts found');
    }

    // Determine set configuration
    const setConfig = this.determineSetConfiguration(artifacts);

    // Check AI availability
    const aiAvailable = await this.aiService.isAvailable();

    if (!aiAvailable) {
      return this.generateAlgorithmicReasoning(character, artifacts, setConfig);
    }

    try {
      const prompt = buildReasoningPrompt(
        {
          id: character.id,
          name: character.name,
          element: character.element ?? 'ANEMO',
          weaponType: character.weaponType ?? 'SWORD',
          rarity: character.rarity ?? 5,
          role: character.role || undefined,
        },
        artifacts.map(this.mapArtifactForBuild),
        setConfig,
      );

      const response = await this.aiService.chat({
        messages: [
          { role: 'system', content: BUILD_RECOMMENDATION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      return this.parseAiResponse<BuildReasoningResult>(response.content);
    } catch (error) {
      this.logger.warn(`AI reasoning failed, falling back to algorithmic: ${error}`);
      return this.generateAlgorithmicReasoning(character, artifacts, setConfig);
    }
  }

  /**
   * Apply a recommended build to equip artifacts on a character
   */
  async applyBuild(
    userId: string,
    accountId: string,
    characterId: string,
    artifactSelections: Record<ArtifactSlot, string | null>,
  ): Promise<{ success: boolean; equipped: string[]; errors: string[] }> {
    // Validate ownership
    await this.ownership.validate(userId, accountId);

    // Get or create account character
    let accountCharacter = await this.prisma.accountCharacter.findFirst({
      where: { accountId, characterId },
    });

    if (!accountCharacter) {
      // Check if character exists
      const character = await this.prisma.character.findUnique({
        where: { id: characterId },
      });

      if (!character) {
        throw new NotFoundException(`Character ${characterId} not found`);
      }

      accountCharacter = await this.prisma.accountCharacter.create({
        data: {
          accountId,
          characterId,
          level: 1,
          constellation: 0,
        },
      });
    }

    const equipped: string[] = [];
    const errors: string[] = [];

    // Equip each artifact
    for (const [slot, artifactId] of Object.entries(artifactSelections)) {
      if (!artifactId) continue;

      try {
        // Verify artifact belongs to account and slot matches
        const artifact = await this.prisma.userArtifact.findFirst({
          where: {
            id: artifactId,
            accountId,
            slot: slot as ArtifactSlot,
          },
        });

        if (!artifact) {
          errors.push(`Artifact ${artifactId} not found or slot mismatch`);
          continue;
        }

        // Unequip any artifact currently in this slot for this character
        await this.prisma.userArtifact.updateMany({
          where: {
            equippedById: accountCharacter.id,
            slot: slot as ArtifactSlot,
          },
          data: { equippedById: null },
        });

        // Equip the new artifact
        await this.prisma.userArtifact.update({
          where: { id: artifactId },
          data: { equippedById: accountCharacter.id },
        });

        equipped.push(artifactId);
      } catch (error) {
        errors.push(`Failed to equip artifact ${artifactId}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      equipped,
      errors,
    };
  }

  // Private helper methods

  private async getUserArtifacts(accountId: string) {
    return this.prisma.userArtifact.findMany({
      where: {
        accountId,
        rarity: { gte: 4 }, // Only 4-5 star artifacts
      },
      include: {
        set: true,
        equippedBy: {
          include: { character: true },
        },
      },
    });
  }

  private async getAvailableSets(artifacts: any[]): Promise<ArtifactSetInfo[]> {
    const setIds = [...new Set(artifacts.map((a) => a.setId))];

    const sets = await this.prisma.artifactSet.findMany({
      where: { id: { in: setIds } },
      select: {
        id: true,
        name: true,
        twoPieceBonus: true,
        fourPieceBonus: true,
      },
    });

    return sets;
  }

  private countArtifactsBySet(artifacts: any[]): Record<string, number> {
    const count: Record<string, number> = {};
    for (const artifact of artifacts) {
      count[artifact.setId] = (count[artifact.setId] || 0) + 1;
    }
    return count;
  }

  private async getExistingBuilds(characterId: string): Promise<ExistingBuildInfo[]> {
    const builds = await this.prisma.artifactBuild.findMany({
      where: {
        characterId,
        isPublic: true,
      },
      select: {
        name: true,
        useFullSet: true,
        recommendedMainStats: true,
        primarySet: { select: { name: true } },
        secondarySet: { select: { name: true } },
      },
      orderBy: { savedBy: { _count: 'desc' } },
      take: 3,
    });

    return builds.map((b) => ({
      name: b.name,
      primarySetName: b.primarySet.name,
      secondarySetName: b.secondarySet?.name,
      useFullSet: b.useFullSet,
      recommendedMainStats: (b.recommendedMainStats as Record<string, string>) || {},
    }));
  }

  private mapArtifactForBuild = (artifact: any): ArtifactForBuild => ({
    id: artifact.id,
    slot: artifact.slot,
    setId: artifact.setId,
    setName: artifact.set?.name || 'Unknown',
    mainStat: artifact.mainStat,
    mainStatValue: artifact.mainStatValue,
    subStats: (artifact.subStats as { stat: string; value: number }[]) || [],
    level: artifact.level,
    rarity: artifact.rarity,
  });

  private calculateSetBonus(artifacts: any[]): string {
    const setCounts: Record<string, { count: number; name: string; twoBonus: string; fourBonus: string | null }> = {};

    for (const artifact of artifacts) {
      if (!setCounts[artifact.setId]) {
        setCounts[artifact.setId] = {
          count: 0,
          name: artifact.set?.name || 'Unknown',
          twoBonus: artifact.set?.twoPieceBonus || '',
          fourBonus: artifact.set?.fourPieceBonus || null,
        };
      }
      setCounts[artifact.setId].count++;
    }

    const bonuses: string[] = [];
    for (const set of Object.values(setCounts)) {
      if (set.count >= 4 && set.fourBonus) {
        bonuses.push(`4pc ${set.name}: ${set.fourBonus}`);
      } else if (set.count >= 2) {
        bonuses.push(`2pc ${set.name}: ${set.twoBonus}`);
      }
    }

    return bonuses.join(' + ') || 'No set bonus';
  }

  private determineSetConfiguration(artifacts: any[]): {
    primarySet: string;
    secondarySet?: string;
    useFullSet: boolean;
  } {
    const setCounts: Record<string, { count: number; name: string }> = {};

    for (const artifact of artifacts) {
      if (!setCounts[artifact.setId]) {
        setCounts[artifact.setId] = { count: 0, name: artifact.set?.name || 'Unknown' };
      }
      setCounts[artifact.setId].count++;
    }

    const sorted = Object.values(setCounts).sort((a, b) => b.count - a.count);

    if (sorted.length === 0) {
      return { primarySet: 'None', useFullSet: false };
    }

    const primary = sorted[0];
    const secondary = sorted[1];

    if (primary.count >= 4) {
      return { primarySet: primary.name, useFullSet: true };
    }

    if (primary.count >= 2 && secondary && secondary.count >= 2) {
      return {
        primarySet: primary.name,
        secondarySet: secondary.name,
        useFullSet: false,
      };
    }

    return { primarySet: primary.name, useFullSet: false };
  }

  private parseAiResponse<T>(content: string): T {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (e) {
      this.logger.error(`Failed to parse AI response: ${content}`);
      throw new Error('Failed to parse AI response as JSON');
    }
  }

  // Algorithmic fallback methods

  private generateAlgorithmicRecommendation(
    context: BuildRecommendationContext,
  ): AiBuildRecommendationResult {
    const { character, inventory } = context;
    const builds: RecommendedBuild[] = [];

    // Find sets with 4+ pieces for potential 4-piece builds
    const fourPieceSets = Object.entries(inventory.setCount)
      .filter(([, count]) => count >= 4)
      .map(([setId]) => inventory.availableSets.find((s) => s.id === setId))
      .filter(Boolean);

    // Find sets with 2+ pieces for 2+2 builds
    const twoPieceSets = Object.entries(inventory.setCount)
      .filter(([, count]) => count >= 2)
      .map(([setId]) => inventory.availableSets.find((s) => s.id === setId))
      .filter(Boolean);

    // Generate 4-piece build if available
    if (fourPieceSets.length > 0) {
      const primarySet = fourPieceSets[0]!;
      const build = this.createAlgorithmicBuild(
        `4-Piece ${primarySet.name}`,
        primarySet,
        null,
        true,
        inventory.artifacts,
        1,
      );
      builds.push(build);
    }

    // Generate 2+2 build if we have at least 2 different sets
    if (twoPieceSets.length >= 2) {
      const primary = twoPieceSets[0]!;
      const secondary = twoPieceSets[1]!;
      const build = this.createAlgorithmicBuild(
        `2+2 ${primary.name} + ${secondary.name}`,
        primary,
        secondary,
        false,
        inventory.artifacts,
        builds.length + 1,
      );
      builds.push(build);
    }

    // If no builds generated, create a best-available build
    if (builds.length === 0 && inventory.artifacts.length > 0) {
      const build = this.createBestAvailableBuild(inventory.artifacts);
      builds.push(build);
    }

    return {
      character: context.character,
      builds,
      overallAnalysis: {
        inventoryQuality: this.assessInventoryQuality(inventory),
        bestBuildIndex: 0,
        farmingSuggestions: this.suggestFarming(character, inventory),
        keyMissingPieces: this.identifyMissingPieces(inventory),
      },
      generatedAt: new Date().toISOString(),
      aiGenerated: false,
    };
  }

  private createAlgorithmicBuild(
    name: string,
    primarySet: ArtifactSetInfo,
    secondarySet: ArtifactSetInfo | null,
    useFullSet: boolean,
    artifacts: ArtifactForBuild[],
    priority: number,
  ): RecommendedBuild {
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];
    const selectedArtifacts: Record<string, BuildArtifactSelection> = {};
    let totalScore = 0;

    for (const slot of slots) {
      const slotArtifacts = artifacts.filter((a) => a.slot === slot);
      let best: ArtifactForBuild | null = null;
      let bestScore = 0;

      for (const artifact of slotArtifacts) {
        let score = this.scoreArtifactAlgorithmically(artifact);

        // Bonus for matching set
        if (artifact.setId === primarySet.id) {
          score *= 1.2;
        } else if (secondarySet && artifact.setId === secondarySet.id) {
          score *= 1.1;
        }

        if (score > bestScore) {
          bestScore = score;
          best = artifact;
        }
      }

      selectedArtifacts[slot] = {
        artifactId: best?.id || null,
        score: Math.round(bestScore),
        notes: best ? `Best ${slot.toLowerCase()} from ${best.setName}` : 'No suitable artifact found',
      };

      totalScore += bestScore;
    }

    return {
      name,
      description: useFullSet
        ? `4-piece ${primarySet.name} build`
        : `2+2 build with ${primarySet.name} and ${secondarySet?.name || 'mixed'}`,
      priority,
      setConfiguration: {
        type: useFullSet ? '4piece' : '2plus2',
        primarySet: primarySet.name,
        secondarySet: secondarySet?.name || null,
        setBonus: useFullSet
          ? primarySet.fourPieceBonus || primarySet.twoPieceBonus
          : `${primarySet.twoPieceBonus}${secondarySet ? ` + ${secondarySet.twoPieceBonus}` : ''}`,
      },
      recommendedMainStats: {
        SANDS: 'ATK%',
        GOBLET: 'Elemental DMG%',
        CIRCLET: 'Crit Rate%',
      },
      subStatPriority: ['Crit Rate%', 'Crit DMG%', 'ATK%', 'ER%'],
      selectedArtifacts: selectedArtifacts as RecommendedBuild['selectedArtifacts'],
      totalScore: Math.round(totalScore),
      statSummary: {
        estimatedCritRate: '~50%',
        estimatedCritDmg: '~100%',
        otherKeyStats: [],
      },
      reasoning: `This build uses the ${useFullSet ? '4-piece' : '2+2'} set configuration based on your available artifacts.`,
      improvements: ['Level up artifacts to +20', 'Look for better sub-stats'],
      viability: totalScore > 300 ? 'good' : totalScore > 200 ? 'workable' : 'needs-improvement',
    };
  }

  private createBestAvailableBuild(artifacts: ArtifactForBuild[]): RecommendedBuild {
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];
    const selectedArtifacts: Record<string, BuildArtifactSelection> = {};
    let totalScore = 0;

    for (const slot of slots) {
      const slotArtifacts = artifacts.filter((a) => a.slot === slot);
      const best = slotArtifacts.reduce<ArtifactForBuild | null>((prev, curr) => {
        const currScore = this.scoreArtifactAlgorithmically(curr);
        const prevScore = prev ? this.scoreArtifactAlgorithmically(prev) : 0;
        return currScore > prevScore ? curr : prev;
      }, null);

      const score = best ? this.scoreArtifactAlgorithmically(best) : 0;
      selectedArtifacts[slot] = {
        artifactId: best?.id || null,
        score: Math.round(score),
        notes: best ? `Best available ${slot.toLowerCase()}` : 'No artifact available',
      };
      totalScore += score;
    }

    return {
      name: 'Best Available Build',
      description: 'Using the highest quality artifacts from your inventory',
      priority: 1,
      setConfiguration: {
        type: 'rainbow',
        primarySet: 'Mixed',
        secondarySet: null,
        setBonus: 'No complete set bonus',
      },
      recommendedMainStats: {
        SANDS: 'ATK%',
        GOBLET: 'Elemental DMG%',
        CIRCLET: 'Crit Rate%',
      },
      subStatPriority: ['Crit Rate%', 'Crit DMG%', 'ATK%', 'ER%'],
      selectedArtifacts: selectedArtifacts as RecommendedBuild['selectedArtifacts'],
      totalScore: Math.round(totalScore),
      statSummary: {
        estimatedCritRate: '~40%',
        estimatedCritDmg: '~80%',
        otherKeyStats: [],
      },
      reasoning: 'This build selects your best individual artifacts regardless of set bonuses.',
      improvements: ['Farm artifact domains to complete sets', 'Focus on crit sub-stats'],
      viability: 'needs-improvement',
    };
  }

  private scoreArtifactAlgorithmically(artifact: ArtifactForBuild): number {
    let score = 0;

    // Sub-stat scoring
    const weights: Record<string, number> = {
      'Crit Rate%': 2,
      'Crit DMG%': 1,
      'ATK%': 0.5,
      'ER%': 0.3,
      EM: 0.3,
      'Energy Recharge%': 0.3,
      'Elemental Mastery': 0.3,
      ATK: 0.1,
    };

    for (const sub of artifact.subStats) {
      const weight = weights[sub.stat] || 0;
      score += sub.value * weight;
    }

    // Level multiplier
    score *= 0.5 + (artifact.level / 20) * 0.5;

    // Rarity multiplier
    score *= artifact.rarity === 5 ? 1 : 0.85;

    return score;
  }

  private assessInventoryQuality(
    inventory: UserInventoryContext,
  ): 'excellent' | 'good' | 'average' | 'limited' {
    const totalArtifacts = inventory.artifacts.length;
    const completeSets = Object.values(inventory.setCount).filter((c) => c >= 4).length;

    if (totalArtifacts >= 50 && completeSets >= 3) return 'excellent';
    if (totalArtifacts >= 30 && completeSets >= 2) return 'good';
    if (totalArtifacts >= 15) return 'average';
    return 'limited';
  }

  private suggestFarming(character: CharacterForBuild, inventory: UserInventoryContext): string[] {
    const suggestions: string[] = [];

    // Generic suggestions based on element
    const elementDomains: Record<string, string> = {
      PYRO: 'Crimson Witch domain',
      HYDRO: 'Heart of Depth domain',
      CRYO: 'Blizzard Strayer domain',
      ELECTRO: 'Thundering Fury domain',
      ANEMO: 'Viridescent Venerer domain',
      GEO: 'Archaic Petra domain',
      DENDRO: 'Deepwood Memories domain',
    };

    if (elementDomains[character.element]) {
      suggestions.push(elementDomains[character.element]);
    }

    // Suggest Emblem for characters needing ER
    if (!inventory.setCount['emblem-of-severed-fate'] || inventory.setCount['emblem-of-severed-fate'] < 4) {
      suggestions.push('Emblem of Severed Fate domain (versatile 4pc set)');
    }

    return suggestions.slice(0, 3);
  }

  private identifyMissingPieces(inventory: UserInventoryContext): string[] {
    const missing: string[] = [];
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];

    for (const slot of slots) {
      const slotArtifacts = inventory.artifacts.filter((a) => a.slot === slot);
      const highQuality = slotArtifacts.filter((a) => {
        const critSubs = a.subStats.filter(
          (s) => s.stat === 'Crit Rate%' || s.stat === 'Crit DMG%',
        );
        return critSubs.length >= 2;
      });

      if (highQuality.length === 0) {
        missing.push(`High-quality ${slot.toLowerCase()} with double crit`);
      }
    }

    return missing.slice(0, 3);
  }

  private generateAlgorithmicComparison(
    character: any,
    builds: { name: string; artifacts: ArtifactForBuild[]; setBonus: string }[],
  ): BuildComparisonResult {
    const scoredBuilds = builds.map((build, index) => {
      const totalScore = build.artifacts.reduce(
        (sum, a) => sum + this.scoreArtifactAlgorithmically(a),
        0,
      );

      return {
        index,
        name: build.name,
        overallScore: Math.min(100, Math.round(totalScore / 5)),
        damageScore: Math.min(100, Math.round(totalScore / 5)),
        consistencyScore: Math.min(100, Math.round(totalScore / 6)),
        strengths: ['Available artifacts'],
        weaknesses: totalScore < 200 ? ['Needs improvement'] : [],
      };
    });

    const winner = scoredBuilds.reduce((prev, curr) =>
      curr.overallScore > prev.overallScore ? curr : prev,
    );

    return {
      comparison: {
        builds: scoredBuilds,
        winner: {
          index: winner.index,
          name: winner.name,
          marginOfVictory: 'moderate',
          explanation: `${winner.name} has the highest overall stat quality.`,
        },
        situationalNotes: {
          forBossRush: winner.index,
          forAbyss: winner.index,
          forOverworld: winner.index,
          reasoning: 'Based on overall artifact quality.',
        },
        improvements: scoredBuilds
          .filter((b) => b.overallScore < 80)
          .map((b) => ({
            buildIndex: b.index,
            suggestion: 'Upgrade artifacts to +20 and look for better sub-stats',
          })),
      },
    };
  }

  private generateAlgorithmicReasoning(
    character: any,
    artifacts: any[],
    setConfig: { primarySet: string; secondarySet?: string; useFullSet: boolean },
  ): BuildReasoningResult {
    // Calculate crit value
    let critRate = 5;
    let critDmg = 50;
    const wastedStats: string[] = [];
    let effectiveSubStats = 0;

    for (const artifact of artifacts) {
      const subStats = (artifact.subStats as { stat: string; value: number }[]) || [];
      for (const sub of subStats) {
        if (sub.stat === 'Crit Rate%') {
          critRate += sub.value;
          effectiveSubStats++;
        } else if (sub.stat === 'Crit DMG%') {
          critDmg += sub.value;
          effectiveSubStats++;
        } else if (['ATK%', 'ER%', 'EM', 'Elemental Mastery', 'Energy Recharge%'].some((s) => sub.stat.includes(s))) {
          effectiveSubStats++;
        } else if (['DEF%', 'DEF', 'HP%', 'HP'].some((s) => sub.stat === s)) {
          wastedStats.push(sub.stat);
        }
      }

      if (artifact.slot === 'CIRCLET') {
        if (artifact.mainStat === 'Crit Rate%') critRate += artifact.mainStatValue;
        else if (artifact.mainStat === 'Crit DMG%') critDmg += artifact.mainStatValue;
      }
    }

    const totalCV = critRate * 2 + critDmg;

    return {
      reasoning: {
        setChoice: {
          explanation: `${setConfig.useFullSet ? '4-piece' : '2+2'} ${setConfig.primarySet} provides good synergy with ${character.name}'s kit.`,
          alternativeSets: [],
          setScore: 70,
        },
        mainStats: {
          SANDS: {
            chosen: artifacts.find((a) => a.slot === 'SANDS')?.mainStat || 'Unknown',
            optimal: 'ATK%',
            assessment: 'Acceptable choice',
          },
          GOBLET: {
            chosen: artifacts.find((a) => a.slot === 'GOBLET')?.mainStat || 'Unknown',
            optimal: 'Elemental DMG%',
            assessment: 'Acceptable choice',
          },
          CIRCLET: {
            chosen: artifacts.find((a) => a.slot === 'CIRCLET')?.mainStat || 'Unknown',
            optimal: 'Crit Rate%',
            assessment: 'Acceptable choice',
          },
        },
        subStats: {
          totalCritValue: Math.round(totalCV),
          effectiveSubStats,
          wastedStats: [...new Set(wastedStats)],
          assessment:
            totalCV > 200
              ? 'Excellent sub-stat quality'
              : totalCV > 150
                ? 'Good sub-stat quality'
                : 'Needs improvement',
        },
        synergy: {
          withKit: `This build supports ${character.name}'s primary damage dealing capabilities.`,
          withTeam: 'Works well in most team compositions.',
          playstyleNotes: 'Focus on maximizing skill and burst damage.',
        },
        overallVerdict: {
          rating: totalCV > 200 ? 'A' : totalCV > 150 ? 'B' : 'C',
          summary: `This build achieves ${Math.round(critRate)}% Crit Rate and ${Math.round(critDmg)}% Crit DMG with ${effectiveSubStats} effective sub-stat rolls.`,
          priorities: wastedStats.length > 0 ? ['Replace artifacts with wasted stats'] : ['Level up artifacts to +20'],
        },
      },
    };
  }
}
