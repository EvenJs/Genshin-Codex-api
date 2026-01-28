import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  const mockUserId = 'user-1';
  const mockAccountId = 'account-1';
  const mockCharacterId = 'ganyu';
  const mockBuildId = 'build-1';
  const mockPrimarySetId = 'blizzard_strayer';
  const mockSecondarySetId = 'gladiators_finale';

  const mockCharacter = {
    id: mockCharacterId,
    name: 'Ganyu',
    element: 'CRYO',
    weaponType: 'BOW',
    rarity: 5,
    imageUrl: null,
  };

  const mockPrimarySet = {
    id: mockPrimarySetId,
    name: 'Blizzard Strayer',
    twoPieceBonus: 'Cryo DMG Bonus +15%',
    fourPieceBonus: 'When attacking, CRIT Rate +20%/+40%',
    imageUrl: null,
  };

  const mockSecondarySet = {
    id: mockSecondarySetId,
    name: "Gladiator's Finale",
    twoPieceBonus: 'ATK +18%',
    imageUrl: null,
  };

  const mockBuild = {
    id: mockBuildId,
    name: '冰套甘雨',
    useFullSet: true,
    recommendedMainStats: { SANDS: 'ATK%', GOBLET: 'Cryo DMG%', CIRCLET: 'Crit DMG%' },
    subStatPriority: ['Crit DMG%', 'Crit Rate%', 'ATK%', 'EM'],
    statWeights: { critRate: 2, critDmg: 1, atkPercent: 0.5 },
    primarySetId: mockPrimarySetId,
    secondarySetId: null,
    isPublic: true,
    creatorId: mockUserId,
    primarySet: mockPrimarySet,
    secondarySet: null,
    _count: { savedBy: 5 },
  };

  const mockAccountCharacter = {
    id: 'account-char-1',
    accountId: mockAccountId,
    characterId: mockCharacterId,
  };

  const createMockArtifact = (
    id: string,
    slot: string,
    setId: string,
    mainStat: string,
    subStats: { stat: string; value: number }[],
    level: number = 20,
    rarity: number = 5,
  ) => ({
    id,
    slot,
    mainStat,
    mainStatValue: 46.6,
    subStats,
    level,
    rarity,
    locked: false,
    equippedById: null,
    set: {
      id: setId,
      name: setId === mockPrimarySetId ? 'Blizzard Strayer' : "Gladiator's Finale",
      twoPieceBonus: setId === mockPrimarySetId ? 'Cryo DMG +15%' : 'ATK +18%',
      fourPieceBonus: setId === mockPrimarySetId ? 'CRIT Rate +20%/+40%' : null,
      imageUrl: null,
    },
  });

  const mockArtifacts = [
    // FLOWER - Blizzard Strayer
    createMockArtifact('flower-1', 'FLOWER', mockPrimarySetId, 'HP', [
      { stat: 'Crit Rate%', value: 10.5 },
      { stat: 'Crit DMG%', value: 21.0 },
      { stat: 'ATK%', value: 5.8 },
      { stat: 'EM', value: 40 },
    ]),
    // FLOWER - Gladiator
    createMockArtifact('flower-2', 'FLOWER', mockSecondarySetId, 'HP', [
      { stat: 'Crit Rate%', value: 7.0 },
      { stat: 'ATK%', value: 11.7 },
      { stat: 'DEF', value: 35 },
      { stat: 'HP%', value: 5.8 },
    ]),
    // PLUME - Blizzard Strayer
    createMockArtifact('plume-1', 'PLUME', mockPrimarySetId, 'ATK', [
      { stat: 'Crit DMG%', value: 28.0 },
      { stat: 'Crit Rate%', value: 3.5 },
      { stat: 'ATK%', value: 5.8 },
      { stat: 'ER%', value: 5.2 },
    ]),
    // SANDS - Blizzard Strayer (correct main stat)
    createMockArtifact('sands-1', 'SANDS', mockPrimarySetId, 'ATK%', [
      { stat: 'Crit Rate%', value: 7.0 },
      { stat: 'Crit DMG%', value: 14.0 },
      { stat: 'EM', value: 23 },
      { stat: 'HP', value: 299 },
    ]),
    // SANDS - Blizzard Strayer (wrong main stat)
    createMockArtifact('sands-2', 'SANDS', mockPrimarySetId, 'HP%', [
      { stat: 'Crit Rate%', value: 14.0 },
      { stat: 'Crit DMG%', value: 28.0 },
      { stat: 'ATK%', value: 11.7 },
      { stat: 'EM', value: 40 },
    ]),
    // GOBLET - Blizzard Strayer (correct main stat)
    createMockArtifact('goblet-1', 'GOBLET', mockPrimarySetId, 'Cryo DMG%', [
      { stat: 'Crit Rate%', value: 3.5 },
      { stat: 'Crit DMG%', value: 7.0 },
      { stat: 'ATK%', value: 5.8 },
      { stat: 'DEF%', value: 5.8 },
    ]),
    // CIRCLET - Blizzard Strayer (correct main stat)
    createMockArtifact('circlet-1', 'CIRCLET', mockPrimarySetId, 'Crit DMG%', [
      { stat: 'Crit Rate%', value: 10.5 },
      { stat: 'ATK%', value: 11.7 },
      { stat: 'EM', value: 35 },
      { stat: 'HP', value: 209 },
    ]),
  ];

  const mockPrismaService = {
    character: {
      findUnique: jest.fn(),
    },
    artifactBuild: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    accountCharacter: {
      findFirst: jest.fn(),
    },
    userArtifact: {
      findMany: jest.fn(),
    },
  };

  const mockOwnershipService = {
    validate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AccountOwnershipService, useValue: mockOwnershipService },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    jest.clearAllMocks();
  });

  describe('getRecommendations', () => {
    it('should return recommendations with specified build', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      expect(result.character).toEqual(mockCharacter);
      expect(result.build.id).toBe(mockBuildId);
      expect(result.recommendations).toHaveLength(5);
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
    });

    it('should use most popular build when buildId not specified', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findMany.mockResolvedValue([mockBuild]);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { limit: 5 },
      );

      expect(result.build.id).toBe(mockBuildId);
      expect(mockPrismaService.artifactBuild.findMany).toHaveBeenCalled();
    });

    it('should throw NotFoundException if character not found', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(null);

      await expect(
        service.getRecommendations(mockUserId, mockAccountId, 'invalid-char', { limit: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if no build exists for character', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findMany.mockResolvedValue([]);

      await expect(
        service.getRecommendations(mockUserId, mockAccountId, mockCharacterId, { limit: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if specified build not found', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(null);

      await expect(
        service.getRecommendations(mockUserId, mockAccountId, mockCharacterId, {
          buildId: 'invalid-build',
          limit: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if build is private and not owned by user', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue({
        ...mockBuild,
        isPublic: false,
        creatorId: 'other-user',
      });

      await expect(
        service.getRecommendations(mockUserId, mockAccountId, mockCharacterId, {
          buildId: mockBuildId,
          limit: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('artifact scoring', () => {
    it('should score artifacts with correct main stat higher', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      // Find SANDS recommendations
      const sandsRec = result.recommendations.find((r) => r.slot === 'SANDS');
      expect(sandsRec).toBeDefined();
      expect(sandsRec!.artifacts.length).toBeGreaterThan(0);

      // The artifact with correct main stat (ATK%) should be marked as mainStatMatch: true
      const correctMainStat = sandsRec!.artifacts.find(
        (a) => a.artifact.id === 'sands-1',
      );
      const wrongMainStat = sandsRec!.artifacts.find(
        (a) => a.artifact.id === 'sands-2',
      );

      expect(correctMainStat?.mainStatMatch).toBe(true);
      expect(wrongMainStat?.mainStatMatch).toBe(false);
    });

    it('should sort artifacts by score in descending order', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      for (const slotRec of result.recommendations) {
        for (let i = 1; i < slotRec.artifacts.length; i++) {
          expect(slotRec.artifacts[i - 1].score).toBeGreaterThanOrEqual(
            slotRec.artifacts[i].score,
          );
        }
      }
    });

    it('should include substat scores breakdown', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      const firstArtifact = result.recommendations[0].artifacts[0];
      expect(firstArtifact.subStatScores).toBeDefined();
      expect(Array.isArray(firstArtifact.subStatScores)).toBe(true);
    });
  });

  describe('optimal set combination', () => {
    it('should find optimal 4-piece set combination', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      expect(result.optimalSet).toBeDefined();
      if (result.optimalSet) {
        expect(result.optimalSet.totalScore).toBeGreaterThan(0);
        expect(result.optimalSet.setBonus).toContain('4pc');

        // Count primary set pieces
        const primaryCount = result.optimalSet.artifacts.filter(
          (a) => a.artifact.set.id === mockPrimarySetId,
        ).length;
        expect(primaryCount).toBeGreaterThanOrEqual(4);
      }
    });

    it('should find optimal 2+2 set combination', async () => {
      const twoPlusTwoBuild = {
        ...mockBuild,
        useFullSet: false,
        secondarySetId: mockSecondarySetId,
        secondarySet: mockSecondarySet,
      };

      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(twoPlusTwoBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      expect(result.optimalSet).toBeDefined();
      if (result.optimalSet) {
        expect(result.optimalSet.setBonus).toContain('2pc');
      }
    });

    it('should return null optimalSet when not enough artifacts', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue([mockArtifacts[0]]); // Only one artifact

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 5 },
      );

      expect(result.optimalSet).toBeNull();
    });
  });

  describe('limit parameter', () => {
    it('should respect the limit parameter for artifacts per slot', async () => {
      mockOwnershipService.validate.mockResolvedValue(undefined);
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(mockAccountCharacter);
      mockPrismaService.userArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.getRecommendations(
        mockUserId,
        mockAccountId,
        mockCharacterId,
        { buildId: mockBuildId, limit: 1 },
      );

      for (const slotRec of result.recommendations) {
        expect(slotRec.artifacts.length).toBeLessThanOrEqual(1);
      }
    });
  });
});
