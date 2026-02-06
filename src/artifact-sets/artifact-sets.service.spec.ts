import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ArtifactSetsService } from './artifact-sets.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ArtifactSetsService', () => {
  let service: ArtifactSetsService;

  const mockArtifactSets = [
    {
      id: 'gladiators_finale',
      name: "Gladiator's Finale",
      rarity: [4, 5],
      twoPieceBonus: 'ATK +18%',
      fourPieceBonus:
        'If the wielder of this artifact set uses a Sword, Claymore or Polearm, increases their Normal Attack DMG by 35%.',
      imageUrl: null,
    },
    {
      id: 'wanderers_troupe',
      name: "Wanderer's Troupe",
      rarity: [4, 5],
      twoPieceBonus: 'Increases Elemental Mastery by 80.',
      fourPieceBonus:
        'Increases Charged Attack DMG by 35% if the character uses a Catalyst or Bow.',
      imageUrl: null,
    },
  ];

  const mockPrismaService = {
    artifactSet: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArtifactSetsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ArtifactSetsService>(ArtifactSetsService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all artifact sets', async () => {
      mockPrismaService.artifactSet.findMany.mockResolvedValue(mockArtifactSets);

      const result = await service.findAll();

      expect(result).toEqual(mockArtifactSets);
      expect(mockPrismaService.artifactSet.findMany).toHaveBeenCalledWith({
        orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          rarity: true,
          twoPieceBonus: true,
          fourPieceBonus: true,
          imageUrl: true,
        },
      });
    });

    it('should return empty array if no artifact sets', async () => {
      mockPrismaService.artifactSet.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return an artifact set by id', async () => {
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(mockArtifactSets[0]);

      const result = await service.findById('gladiators_finale');

      expect(result).toEqual(mockArtifactSets[0]);
      expect(mockPrismaService.artifactSet.findUnique).toHaveBeenCalledWith({
        where: { id: 'gladiators_finale' },
        select: {
          id: true,
          name: true,
          rarity: true,
          twoPieceBonus: true,
          fourPieceBonus: true,
          imageUrl: true,
        },
      });
    });

    it('should throw NotFoundException if artifact set not found', async () => {
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
