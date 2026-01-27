import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { UserArtifactsService } from './user-artifacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';

describe('UserArtifactsService', () => {
  let service: UserArtifactsService;

  const mockUserId = 'user-1';
  const mockAccountId = 'account-1';
  const mockArtifactId = 'artifact-1';

  const mockArtifact = {
    id: mockArtifactId,
    accountId: mockAccountId,
    setId: 'gladiators_finale',
    slot: ArtifactSlot.FLOWER,
    mainStat: 'HP',
    mainStatValue: 4780,
    subStats: [
      { stat: 'Crit Rate%', value: 3.9 },
      { stat: 'Crit DMG%', value: 7.8 },
    ],
    level: 20,
    rarity: 5,
    locked: false,
    equippedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    set: {
      id: 'gladiators_finale',
      name: "Gladiator's Finale",
      imageUrl: null,
    },
    equippedBy: null,
  };

  const mockArtifactSet = {
    id: 'gladiators_finale',
    name: "Gladiator's Finale",
    rarity: [4, 5],
    twoPieceBonus: 'ATK +18%',
    fourPieceBonus: 'Normal Attack DMG +35%',
    imageUrl: null,
  };

  const mockPrismaService = {
    userArtifact: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
    artifactSet: {
      findUnique: jest.fn(),
    },
    accountCharacter: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockOwnershipService = {
    validate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserArtifactsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AccountOwnershipService, useValue: mockOwnershipService },
      ],
    }).compile();

    service = module.get<UserArtifactsService>(UserArtifactsService);

    jest.clearAllMocks();
    mockOwnershipService.validate.mockResolvedValue({ id: mockAccountId, userId: mockUserId });
  });

  describe('findAll', () => {
    it('should return paginated artifacts', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockArtifact]]);

      const result = await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        items: [mockArtifact],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
    });

    it('should filter by setId', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockArtifact]]);

      await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
        setId: 'gladiators_finale',
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should filter by slot', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockArtifact]]);

      await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
        slot: ArtifactSlot.FLOWER,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should filter by rarity', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockArtifact]]);

      await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
        rarity: 5,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should filter by locked', async () => {
      mockPrismaService.$transaction.mockResolvedValue([0, []]);

      const result = await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
        locked: true,
      });

      expect(result.items).toHaveLength(0);
    });

    it('should filter by equipped', async () => {
      mockPrismaService.$transaction.mockResolvedValue([0, []]);

      const result = await service.findAll(mockUserId, mockAccountId, {
        page: 1,
        pageSize: 20,
        equipped: true,
      });

      expect(result.items).toHaveLength(0);
    });

    it('should throw ForbiddenException if account belongs to another user', async () => {
      mockOwnershipService.validate.mockRejectedValue(
        new ForbiddenException('You do not own this account'),
      );

      await expect(
        service.findAll(mockUserId, mockAccountId, { page: 1, pageSize: 20 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findById', () => {
    it('should return an artifact by id', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(mockArtifact);

      const result = await service.findById(mockUserId, mockAccountId, mockArtifactId);

      expect(result).toEqual(mockArtifact);
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
    });

    it('should throw NotFoundException if artifact not found', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(null);

      await expect(
        service.findById(mockUserId, mockAccountId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      setId: 'gladiators_finale',
      slot: ArtifactSlot.FLOWER,
      mainStat: 'HP',
      mainStatValue: 4780,
      subStats: [
        { stat: 'Crit Rate%', value: 3.9 },
        { stat: 'Crit DMG%', value: 7.8 },
      ],
      level: 20,
      rarity: 5,
    };

    it('should create an artifact', async () => {
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(mockArtifactSet);
      mockPrismaService.userArtifact.create.mockResolvedValue(mockArtifact);

      const result = await service.create(mockUserId, mockAccountId, createDto);

      expect(result).toEqual(mockArtifact);
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
      expect(mockPrismaService.artifactSet.findUnique).toHaveBeenCalledWith({
        where: { id: createDto.setId },
      });
    });

    it('should throw NotFoundException if artifact set not found', async () => {
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUserId, mockAccountId, createDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = {
      level: 20,
      locked: true,
    };

    it('should update an artifact', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(mockArtifact);
      mockPrismaService.userArtifact.update.mockResolvedValue({
        ...mockArtifact,
        level: 20,
        locked: true,
      });

      const result = await service.update(mockUserId, mockAccountId, mockArtifactId, updateDto);

      expect(result.locked).toBe(true);
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
    });

    it('should throw NotFoundException if artifact not found', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(null);

      await expect(
        service.update(mockUserId, mockAccountId, 'non-existent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if new setId not found', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(mockArtifact);
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(null);

      await expect(
        service.update(mockUserId, mockAccountId, mockArtifactId, {
          setId: 'non-existent-set',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if equippedById character not found', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(mockArtifact);
      mockPrismaService.accountCharacter.findFirst.mockResolvedValue(null);

      await expect(
        service.update(mockUserId, mockAccountId, mockArtifactId, {
          equippedById: 'non-existent-character',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an artifact', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(mockArtifact);
      mockPrismaService.userArtifact.delete.mockResolvedValue(mockArtifact);

      const result = await service.remove(mockUserId, mockAccountId, mockArtifactId);

      expect(result).toEqual({ ok: true });
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
      expect(mockPrismaService.userArtifact.delete).toHaveBeenCalledWith({
        where: { id: mockArtifactId },
      });
    });

    it('should throw NotFoundException if artifact not found', async () => {
      mockPrismaService.userArtifact.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(mockUserId, mockAccountId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return artifact statistics', async () => {
      mockPrismaService.$transaction.mockResolvedValue([
        10, // totalCount
        3, // equippedCount
        [
          { slot: ArtifactSlot.FLOWER, _count: { _all: 2 } },
          { slot: ArtifactSlot.PLUME, _count: { _all: 3 } },
        ],
        [
          { rarity: 5, _count: { _all: 8 } },
          { rarity: 4, _count: { _all: 2 } },
        ],
      ]);

      const result = await service.getStats(mockUserId, mockAccountId);

      expect(result).toEqual({
        totalCount: 10,
        equippedCount: 3,
        unequippedCount: 7,
        bySlot: {
          FLOWER: 2,
          PLUME: 3,
        },
        byRarity: {
          5: 8,
          4: 2,
        },
      });
      expect(mockOwnershipService.validate).toHaveBeenCalledWith(mockUserId, mockAccountId);
    });
  });
});
