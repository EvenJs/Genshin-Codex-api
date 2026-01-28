import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BuildsService } from './builds.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BuildsService', () => {
  let service: BuildsService;

  const mockUserId = 'user-1';
  const mockBuildId = 'build-1';
  const mockCharacterId = 'ganyu';
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

  const mockArtifactSet = {
    id: mockPrimarySetId,
    name: 'Blizzard Strayer',
    rarity: [4, 5],
    twoPieceBonus: 'Cryo DMG Bonus +15%',
    fourPieceBonus: 'CRIT Rate increased',
    imageUrl: null,
  };

  const mockBuild = {
    id: mockBuildId,
    name: '冰套甘雨',
    description: '永冻流配装',
    characterId: mockCharacterId,
    creatorId: mockUserId,
    isPublic: true,
    primarySetId: mockPrimarySetId,
    secondarySetId: null,
    useFullSet: true,
    recommendedMainStats: { SANDS: 'ATK%', GOBLET: 'Cryo DMG%', CIRCLET: 'Crit DMG%' },
    subStatPriority: ['Crit DMG%', 'Crit Rate%', 'ATK%', 'EM'],
    statWeights: { critRate: 2, critDmg: 1 },
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    character: mockCharacter,
    creator: { id: mockUserId, email: 'test@example.com' },
    primarySet: mockArtifactSet,
    secondarySet: null,
    _count: { savedBy: 5 },
  };

  const mockSavedBuild = {
    id: 'saved-1',
    userId: mockUserId,
    buildId: mockBuildId,
    notes: 'Great build!',
    createdAt: new Date(),
    build: mockBuild,
  };

  const mockPrismaService = {
    artifactBuild: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    savedBuild: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    character: {
      findUnique: jest.fn(),
    },
    artifactSet: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuildsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BuildsService>(BuildsService);
    jest.clearAllMocks();
  });

  describe('findPublicBuilds', () => {
    it('should return paginated public builds', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockBuild]]);

      const result = await service.findPublicBuilds({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: [{ ...mockBuild, saveCount: 5, _count: undefined }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter by characterId', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockBuild]]);

      await service.findPublicBuilds({ page: 1, pageSize: 20, characterId: mockCharacterId });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('findMyBuilds', () => {
    it('should return paginated user builds', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockBuild]]);

      const result = await service.findMyBuilds(mockUserId, { page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: [{ ...mockBuild, saveCount: 5, _count: undefined }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter by characterId', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockBuild]]);

      await service.findMyBuilds(mockUserId, {
        page: 1,
        pageSize: 20,
        characterId: mockCharacterId,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a public build', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);

      const result = await service.findById(mockBuildId);

      expect(result).toEqual({ ...mockBuild, saveCount: 5, _count: undefined });
    });

    it('should return a private build if owned by user', async () => {
      const privateBuild = { ...mockBuild, isPublic: false };
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(privateBuild);

      const result = await service.findById(mockBuildId, mockUserId);

      expect(result).toEqual({ ...privateBuild, saveCount: 5, _count: undefined });
    });

    it('should throw NotFoundException if build not found', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private build not owned by user', async () => {
      const privateBuild = { ...mockBuild, isPublic: false, creator: { id: 'other-user' } };
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(privateBuild);

      await expect(service.findById(mockBuildId, mockUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    const createDto = {
      name: '冰套甘雨',
      characterId: mockCharacterId,
      primarySetId: mockPrimarySetId,
      recommendedMainStats: { SANDS: 'ATK%', GOBLET: 'Cryo DMG%', CIRCLET: 'Crit DMG%' },
      subStatPriority: ['Crit DMG%', 'Crit Rate%'],
    };

    it('should create a build', async () => {
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(mockArtifactSet);
      mockPrismaService.artifactBuild.create.mockResolvedValue(mockBuild);

      const result = await service.create(mockUserId, createDto);

      expect(result).toEqual({ ...mockBuild, saveCount: 5, _count: undefined });
      expect(mockPrismaService.character.findUnique).toHaveBeenCalledWith({
        where: { id: mockCharacterId },
      });
      expect(mockPrismaService.artifactSet.findUnique).toHaveBeenCalledWith({
        where: { id: mockPrimarySetId },
      });
    });

    it('should throw NotFoundException if character not found', async () => {
      mockPrismaService.character.findUnique.mockResolvedValue(null);

      await expect(service.create(mockUserId, createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if primary set not found', async () => {
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(null);

      await expect(service.create(mockUserId, createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if 2+2 build without secondary set', async () => {
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(mockArtifactSet);

      await expect(
        service.create(mockUserId, { ...createDto, useFullSet: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a 2+2 build with secondary set', async () => {
      mockPrismaService.character.findUnique.mockResolvedValue(mockCharacter);
      mockPrismaService.artifactSet.findUnique.mockResolvedValue(mockArtifactSet);
      mockPrismaService.artifactBuild.create.mockResolvedValue({
        ...mockBuild,
        useFullSet: false,
        secondarySetId: mockSecondarySetId,
      });

      const result = await service.create(mockUserId, {
        ...createDto,
        useFullSet: false,
        secondarySetId: mockSecondarySetId,
      });

      expect(result.useFullSet).toBe(false);
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Updated Build Name' };

    it('should update a build', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.artifactBuild.update.mockResolvedValue({
        ...mockBuild,
        name: 'Updated Build Name',
      });

      const result = await service.update(mockUserId, mockBuildId, updateDto);

      expect(result.name).toBe('Updated Build Name');
    });

    it('should throw NotFoundException if build not found', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(null);

      await expect(
        service.update(mockUserId, 'non-existent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not the owner', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue({
        ...mockBuild,
        creatorId: 'other-user',
      });

      await expect(
        service.update(mockUserId, mockBuildId, updateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if new character not found', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.character.findUnique.mockResolvedValue(null);

      await expect(
        service.update(mockUserId, mockBuildId, { characterId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a build', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.artifactBuild.delete.mockResolvedValue(mockBuild);

      const result = await service.remove(mockUserId, mockBuildId);

      expect(result).toEqual({ ok: true });
      expect(mockPrismaService.artifactBuild.delete).toHaveBeenCalledWith({
        where: { id: mockBuildId },
      });
    });

    it('should throw NotFoundException if build not found', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(null);

      await expect(service.remove(mockUserId, 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not the owner', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue({
        ...mockBuild,
        creatorId: 'other-user',
      });

      await expect(service.remove(mockUserId, mockBuildId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('saveBuild', () => {
    const saveDto = { buildId: mockBuildId, notes: 'Great build!' };

    it('should save a public build', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.savedBuild.findUnique.mockResolvedValue(null);
      mockPrismaService.savedBuild.create.mockResolvedValue(mockSavedBuild);

      const result = await service.saveBuild(mockUserId, saveDto);

      expect(result.id).toBe('saved-1');
      expect(result.notes).toBe('Great build!');
    });

    it('should throw NotFoundException if build not found', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(null);

      await expect(service.saveBuild(mockUserId, saveDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private build not owned by user', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue({
        ...mockBuild,
        isPublic: false,
        creatorId: 'other-user',
      });

      await expect(service.saveBuild(mockUserId, saveDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if already saved', async () => {
      mockPrismaService.artifactBuild.findUnique.mockResolvedValue(mockBuild);
      mockPrismaService.savedBuild.findUnique.mockResolvedValue(mockSavedBuild);

      await expect(service.saveBuild(mockUserId, saveDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findSavedBuilds', () => {
    it('should return paginated saved builds', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockSavedBuild]]);

      const result = await service.findSavedBuilds(mockUserId, { page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('saved-1');
    });
  });

  describe('unsaveBuild', () => {
    it('should remove a saved build', async () => {
      mockPrismaService.savedBuild.findFirst.mockResolvedValue(mockSavedBuild);
      mockPrismaService.savedBuild.delete.mockResolvedValue(mockSavedBuild);

      const result = await service.unsaveBuild(mockUserId, 'saved-1');

      expect(result).toEqual({ ok: true });
    });

    it('should throw NotFoundException if saved build not found', async () => {
      mockPrismaService.savedBuild.findFirst.mockResolvedValue(null);

      await expect(service.unsaveBuild(mockUserId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
