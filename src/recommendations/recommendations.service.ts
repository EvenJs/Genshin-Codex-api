import { Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationQueryDto } from './dto';

// Sub-stat name to weight key mapping
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

// Default stat weights if not specified in build
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

// Maximum possible sub-stat rolls for 5-star artifacts at level 20
const MAX_SUBSTAT_ROLLS: Record<string, number> = {
  critRate: 3.9 * 6, // ~23.4%
  critDmg: 7.8 * 6, // ~46.8%
  atk: 19.45 * 6,
  atkPercent: 5.83 * 6,
  def: 23.15 * 6,
  defPercent: 7.29 * 6,
  hp: 298.75 * 6,
  hpPercent: 5.83 * 6,
  em: 23.31 * 6,
  er: 6.48 * 6,
};

interface SubStat {
  stat: string;
  value: number;
}

export interface ScoredArtifact {
  artifact: any;
  score: number;
  mainStatMatch: boolean;
  subStatScores: { stat: string; value: number; score: number }[];
}

export interface RecommendationResult {
  build: any;
  character: any;
  recommendations: {
    slot: ArtifactSlot;
    artifacts: ScoredArtifact[];
  }[];
  optimalSet: {
    artifacts: ScoredArtifact[];
    totalScore: number;
    setBonus: string;
  } | null;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: AccountOwnershipService,
  ) {}

  /**
   * Get artifact recommendations for a character
   */
  async getRecommendations(
    userId: string,
    accountId: string,
    characterId: string,
    query: RecommendationQueryDto,
  ): Promise<RecommendationResult> {
    // Validate account ownership
    await this.ownership.validate(userId, accountId);

    // Verify character exists
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        imageUrl: true,
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    // Get the build to use for scoring
    let build = query.buildId
      ? await this.getBuildById(query.buildId, userId)
      : await this.getMostPopularBuild(characterId);

    if (!build) {
      throw new NotFoundException(
        `No build found for character ${characterId}. Create a build first or specify a buildId.`,
      );
    }

    // Get all user's artifacts (unequipped or equipped by this character)
    const accountCharacter = await this.prisma.accountCharacter.findFirst({
      where: { accountId, characterId },
    });

    const artifacts = await this.prisma.userArtifact.findMany({
      where: {
        accountId,
        rarity: { gte: 4 }, // Only consider 4-5 star artifacts
        OR: [
          { equippedById: null }, // Unequipped
          { equippedById: accountCharacter?.id }, // Equipped by this character
        ],
      },
      select: {
        id: true,
        slot: true,
        mainStat: true,
        mainStatValue: true,
        subStats: true,
        level: true,
        rarity: true,
        locked: true,
        equippedById: true,
        set: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
            fourPieceBonus: true,
            imageUrl: true,
          },
        },
      },
    });

    // Score all artifacts
    const scoredArtifacts = artifacts.map((artifact) =>
      this.scoreArtifact(artifact, build),
    );

    // Group by slot and sort by score
    const bySlot = this.groupBySlot(scoredArtifacts, query.limit);

    // Find optimal set combination
    const optimalSet = this.findOptimalSetCombination(scoredArtifacts, build);

    return {
      build: {
        id: build.id,
        name: build.name,
        useFullSet: build.useFullSet,
        primarySet: build.primarySet,
        secondarySet: build.secondarySet,
        recommendedMainStats: build.recommendedMainStats,
        subStatPriority: build.subStatPriority,
      },
      character,
      recommendations: bySlot,
      optimalSet,
    };
  }

  /**
   * Score a single artifact based on build configuration
   */
  private scoreArtifact(artifact: any, build: any): ScoredArtifact {
    const subStats = (artifact.subStats as SubStat[]) || [];
    const statWeights = (build.statWeights as Record<string, number>) || DEFAULT_STAT_WEIGHTS;
    const recommendedMainStats = build.recommendedMainStats as Record<string, string>;

    // Check main stat match for SANDS, GOBLET, CIRCLET
    let mainStatMatch = true;
    if (['SANDS', 'GOBLET', 'CIRCLET'].includes(artifact.slot)) {
      const recommendedMain = recommendedMainStats?.[artifact.slot];
      mainStatMatch = !recommendedMain || artifact.mainStat === recommendedMain;
    }

    // Score sub-stats
    let totalSubStatScore = 0;
    const subStatScores: { stat: string; value: number; score: number }[] = [];

    for (const subStat of subStats) {
      const weightKey = STAT_NAME_TO_KEY[subStat.stat];
      const weight = weightKey ? (statWeights[weightKey] ?? DEFAULT_STAT_WEIGHTS[weightKey] ?? 0) : 0;
      const maxValue = weightKey ? (MAX_SUBSTAT_ROLLS[weightKey] ?? 100) : 100;

      // Normalize the value to 0-1 range based on max possible rolls
      const normalizedValue = Math.min(subStat.value / maxValue, 1);
      const subScore = normalizedValue * weight * 100;

      subStatScores.push({
        stat: subStat.stat,
        value: subStat.value,
        score: Math.round(subScore * 10) / 10,
      });

      totalSubStatScore += subScore;
    }

    // Apply penalties and bonuses
    let finalScore = totalSubStatScore;

    // Main stat penalty (50% reduction for wrong main stat)
    if (!mainStatMatch) {
      finalScore *= 0.5;
    }

    // Level bonus (artifacts at level 20 get full score)
    const levelMultiplier = 0.5 + (artifact.level / 20) * 0.5;
    finalScore *= levelMultiplier;

    // Rarity bonus (5-star = 1.0, 4-star = 0.85)
    const rarityMultiplier = artifact.rarity === 5 ? 1 : 0.85;
    finalScore *= rarityMultiplier;

    return {
      artifact,
      score: Math.round(finalScore * 10) / 10,
      mainStatMatch,
      subStatScores,
    };
  }

  /**
   * Group scored artifacts by slot and return top N for each
   */
  private groupBySlot(
    scoredArtifacts: ScoredArtifact[],
    limit: number,
  ): { slot: ArtifactSlot; artifacts: ScoredArtifact[] }[] {
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];
    const result: { slot: ArtifactSlot; artifacts: ScoredArtifact[] }[] = [];

    for (const slot of slots) {
      const slotArtifacts = scoredArtifacts
        .filter((sa) => sa.artifact.slot === slot)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      result.push({ slot, artifacts: slotArtifacts });
    }

    return result;
  }

  /**
   * Find the optimal set combination based on build configuration
   * Supports both 4-piece and 2+2 configurations
   */
  private findOptimalSetCombination(
    scoredArtifacts: ScoredArtifact[],
    build: any,
  ): { artifacts: ScoredArtifact[]; totalScore: number; setBonus: string } | null {
    const useFullSet = build.useFullSet;
    const primarySetId = build.primarySetId;
    const secondarySetId = build.secondarySetId;

    if (useFullSet) {
      // 4-piece set optimization
      return this.findBest4PieceSet(scoredArtifacts, primarySetId, build);
    } else if (secondarySetId) {
      // 2+2 set optimization
      return this.findBest2Plus2Set(scoredArtifacts, primarySetId, secondarySetId, build);
    }

    return null;
  }

  /**
   * Find best 4-piece set combination
   */
  private findBest4PieceSet(
    scoredArtifacts: ScoredArtifact[],
    primarySetId: string,
    build: any,
  ): { artifacts: ScoredArtifact[]; totalScore: number; setBonus: string } | null {
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];
    const primarySetArtifacts = scoredArtifacts.filter(
      (sa) => sa.artifact.set.id === primarySetId,
    );

    // For 4-piece, we need at least 4 artifacts from the primary set
    // The 5th slot can be any artifact (rainbow slot)
    const result: ScoredArtifact[] = [];
    const usedSlots = new Set<ArtifactSlot>();

    // First, get the best artifact from primary set for each slot
    const primaryBySlot = new Map<ArtifactSlot, ScoredArtifact[]>();
    for (const slot of slots) {
      primaryBySlot.set(
        slot,
        primarySetArtifacts
          .filter((sa) => sa.artifact.slot === slot)
          .sort((a, b) => b.score - a.score),
      );
    }

    // Find which slot benefits most from being the "rainbow" slot
    // (the slot where we pick the best artifact regardless of set)
    let bestCombination: ScoredArtifact[] | null = null;
    let bestTotalScore = -1;

    for (const rainbowSlot of slots) {
      const combination: ScoredArtifact[] = [];
      let validCombination = true;

      for (const slot of slots) {
        if (slot === rainbowSlot) {
          // Rainbow slot: pick best overall artifact
          const bestForSlot = scoredArtifacts
            .filter((sa) => sa.artifact.slot === slot)
            .sort((a, b) => b.score - a.score)[0];
          if (!bestForSlot) {
            validCombination = false;
            break;
          }
          combination.push(bestForSlot);
        } else {
          // Primary set slot: pick best from primary set
          const primaryForSlot = primaryBySlot.get(slot)?.[0];
          if (!primaryForSlot) {
            validCombination = false;
            break;
          }
          combination.push(primaryForSlot);
        }
      }

      if (validCombination && combination.length === 5) {
        // Verify we have at least 4 pieces of the primary set
        const primaryCount = combination.filter(
          (sa) => sa.artifact.set.id === primarySetId,
        ).length;
        if (primaryCount >= 4) {
          const totalScore = combination.reduce((sum, sa) => sum + sa.score, 0);
          if (totalScore > bestTotalScore) {
            bestTotalScore = totalScore;
            bestCombination = combination;
          }
        }
      }
    }

    // Fallback: try to use all 5 pieces from primary set
    if (!bestCombination) {
      const fallbackCombination: ScoredArtifact[] = [];
      for (const slot of slots) {
        const best = primaryBySlot.get(slot)?.[0];
        if (best) {
          fallbackCombination.push(best);
        }
      }
      if (fallbackCombination.length >= 4) {
        bestCombination = fallbackCombination;
        bestTotalScore = fallbackCombination.reduce((sum, sa) => sum + sa.score, 0);
      }
    }

    if (!bestCombination || bestCombination.length < 4) {
      return null;
    }

    const setBonus = build.primarySet?.fourPieceBonus
      ? `4pc ${build.primarySet.name}: ${build.primarySet.fourPieceBonus}`
      : `4pc ${build.primarySet?.name || 'Unknown'}`;

    return {
      artifacts: bestCombination,
      totalScore: Math.round(bestTotalScore * 10) / 10,
      setBonus,
    };
  }

  /**
   * Find best 2+2 set combination
   */
  private findBest2Plus2Set(
    scoredArtifacts: ScoredArtifact[],
    primarySetId: string,
    secondarySetId: string,
    build: any,
  ): { artifacts: ScoredArtifact[]; totalScore: number; setBonus: string } | null {
    const slots: ArtifactSlot[] = ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'];

    const primaryArtifacts = scoredArtifacts.filter(
      (sa) => sa.artifact.set.id === primarySetId,
    );
    const secondaryArtifacts = scoredArtifacts.filter(
      (sa) => sa.artifact.set.id === secondarySetId,
    );

    // Group by slot for each set
    const primaryBySlot = new Map<ArtifactSlot, ScoredArtifact[]>();
    const secondaryBySlot = new Map<ArtifactSlot, ScoredArtifact[]>();

    for (const slot of slots) {
      primaryBySlot.set(
        slot,
        primaryArtifacts
          .filter((sa) => sa.artifact.slot === slot)
          .sort((a, b) => b.score - a.score),
      );
      secondaryBySlot.set(
        slot,
        secondaryArtifacts
          .filter((sa) => sa.artifact.slot === slot)
          .sort((a, b) => b.score - a.score),
      );
    }

    // Try all combinations of 2 slots for primary set, 2 for secondary, 1 rainbow
    let bestCombination: ScoredArtifact[] | null = null;
    let bestTotalScore = -1;

    // Generate all ways to select 2 slots for primary, 2 for secondary
    const slotCombinations = this.generate2Plus2SlotCombinations(slots);

    for (const { primarySlots, secondarySlots, rainbowSlot } of slotCombinations) {
      const combination: ScoredArtifact[] = [];
      let validCombination = true;

      for (const slot of primarySlots) {
        const best = primaryBySlot.get(slot)?.[0];
        if (!best) {
          validCombination = false;
          break;
        }
        combination.push(best);
      }

      if (!validCombination) continue;

      for (const slot of secondarySlots) {
        const best = secondaryBySlot.get(slot)?.[0];
        if (!best) {
          validCombination = false;
          break;
        }
        combination.push(best);
      }

      if (!validCombination) continue;

      // Rainbow slot: best overall artifact
      const rainbowBest = scoredArtifacts
        .filter((sa) => sa.artifact.slot === rainbowSlot)
        .sort((a, b) => b.score - a.score)[0];
      if (rainbowBest) {
        combination.push(rainbowBest);
      } else {
        continue;
      }

      const totalScore = combination.reduce((sum, sa) => sum + sa.score, 0);
      if (totalScore > bestTotalScore) {
        bestTotalScore = totalScore;
        bestCombination = combination;
      }
    }

    // Also try 2+2+1 where the +1 is from either set
    if (!bestCombination) {
      // Fallback: just get best 2 from each set
      const primaryBest: ScoredArtifact[] = [];
      const secondaryBest: ScoredArtifact[] = [];

      for (const slot of slots) {
        const p = primaryBySlot.get(slot)?.[0];
        const s = secondaryBySlot.get(slot)?.[0];
        if (p) primaryBest.push(p);
        if (s) secondaryBest.push(s);
      }

      primaryBest.sort((a, b) => b.score - a.score);
      secondaryBest.sort((a, b) => b.score - a.score);

      const usedSlots = new Set<ArtifactSlot>();
      const fallbackCombination: ScoredArtifact[] = [];

      // Add top 2 from primary
      for (const sa of primaryBest) {
        if (fallbackCombination.length >= 2) break;
        if (!usedSlots.has(sa.artifact.slot)) {
          usedSlots.add(sa.artifact.slot);
          fallbackCombination.push(sa);
        }
      }

      // Add top 2 from secondary
      for (const sa of secondaryBest) {
        if (fallbackCombination.filter((x) => x.artifact.set.id === secondarySetId).length >= 2)
          break;
        if (!usedSlots.has(sa.artifact.slot)) {
          usedSlots.add(sa.artifact.slot);
          fallbackCombination.push(sa);
        }
      }

      // Fill remaining with best available
      for (const slot of slots) {
        if (!usedSlots.has(slot)) {
          const best = scoredArtifacts
            .filter((sa) => sa.artifact.slot === slot)
            .sort((a, b) => b.score - a.score)[0];
          if (best) {
            fallbackCombination.push(best);
            usedSlots.add(slot);
          }
        }
      }

      if (fallbackCombination.length >= 4) {
        bestCombination = fallbackCombination;
        bestTotalScore = fallbackCombination.reduce((sum, sa) => sum + sa.score, 0);
      }
    }

    if (!bestCombination) {
      return null;
    }

    const setBonus =
      `2pc ${build.primarySet?.name || 'Unknown'}: ${build.primarySet?.twoPieceBonus || ''} + ` +
      `2pc ${build.secondarySet?.name || 'Unknown'}: ${build.secondarySet?.twoPieceBonus || ''}`;

    return {
      artifacts: bestCombination,
      totalScore: Math.round(bestTotalScore * 10) / 10,
      setBonus,
    };
  }

  /**
   * Generate all valid slot combinations for 2+2+1 configuration
   */
  private generate2Plus2SlotCombinations(
    slots: ArtifactSlot[],
  ): { primarySlots: ArtifactSlot[]; secondarySlots: ArtifactSlot[]; rainbowSlot: ArtifactSlot }[] {
    const combinations: {
      primarySlots: ArtifactSlot[];
      secondarySlots: ArtifactSlot[];
      rainbowSlot: ArtifactSlot;
    }[] = [];

    // Generate all 2-combinations of slots for primary
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const primarySlots = [slots[i], slots[j]];
        const remaining = slots.filter((s) => s !== slots[i] && s !== slots[j]);

        // For each remaining 3 slots, pick 2 for secondary
        for (let k = 0; k < remaining.length; k++) {
          for (let l = k + 1; l < remaining.length; l++) {
            const secondarySlots = [remaining[k], remaining[l]];
            const rainbowSlot = remaining.find(
              (s) => s !== remaining[k] && s !== remaining[l],
            )!;

            combinations.push({ primarySlots, secondarySlots, rainbowSlot });
          }
        }
      }
    }

    return combinations;
  }

  /**
   * Get a specific build by ID
   */
  private async getBuildById(buildId: string, userId: string) {
    const build = await this.prisma.artifactBuild.findUnique({
      where: { id: buildId },
      select: {
        id: true,
        name: true,
        useFullSet: true,
        recommendedMainStats: true,
        subStatPriority: true,
        statWeights: true,
        primarySetId: true,
        secondarySetId: true,
        isPublic: true,
        creatorId: true,
        primarySet: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
            fourPieceBonus: true,
          },
        },
        secondarySet: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
          },
        },
      },
    });

    if (!build) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    // Check access
    if (!build.isPublic && build.creatorId !== userId) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    return build;
  }

  /**
   * Get the most popular public build for a character
   */
  private async getMostPopularBuild(characterId: string) {
    const builds = await this.prisma.artifactBuild.findMany({
      where: {
        characterId,
        isPublic: true,
      },
      select: {
        id: true,
        name: true,
        useFullSet: true,
        recommendedMainStats: true,
        subStatPriority: true,
        statWeights: true,
        primarySetId: true,
        secondarySetId: true,
        primarySet: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
            fourPieceBonus: true,
          },
        },
        secondarySet: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
          },
        },
        _count: {
          select: {
            savedBy: true,
          },
        },
      },
      orderBy: [
        {
          savedBy: {
            _count: 'desc',
          },
        },
        { createdAt: 'desc' },
      ],
      take: 1,
    });

    return builds[0] || null;
  }
}
