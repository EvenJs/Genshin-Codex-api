import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AchievementsService', () => {
  let service: AchievementsService;

  const mockAchievements = [
    {
      id: 'ach-1',
      name: 'First Steps',
      description: 'Complete the tutorial',
      category: 'Wonders of the World',
      region: 'Mondstadt',
      isHidden: false,
      version: '1.0',
      primogems: 5,
    },
    {
      id: 'ach-2',
      name: 'Wind Catcher',
      description: 'Catch the wind',
      category: 'Wonders of the World',
      region: 'Mondstadt',
      isHidden: false,
      version: '1.0',
      primogems: 10,
    },
  ];

  const mockPrismaService = {
    achievement: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);

    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return paginated achievements', async () => {
      mockPrismaService.$transaction.mockResolvedValue([2, mockAchievements]);

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: mockAchievements,
        total: 2,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter by category', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockAchievements[0]]]);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        category: 'Wonders of the World',
      });

      expect(result.items).toHaveLength(1);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should filter by region', async () => {
      mockPrismaService.$transaction.mockResolvedValue([2, mockAchievements]);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        region: 'Mondstadt',
      });

      expect(result.items).toHaveLength(2);
    });

    it('should filter by isHidden', async () => {
      mockPrismaService.$transaction.mockResolvedValue([0, []]);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        isHidden: true,
      });

      expect(result.items).toHaveLength(0);
    });

    it('should filter by version', async () => {
      mockPrismaService.$transaction.mockResolvedValue([2, mockAchievements]);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        version: '1.0',
      });

      expect(result.items).toHaveLength(2);
    });

    it('should search by query string', async () => {
      mockPrismaService.$transaction.mockResolvedValue([1, [mockAchievements[0]]]);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        q: 'First',
      });

      expect(result.items).toHaveLength(1);
    });

    it('should handle pagination correctly', async () => {
      mockPrismaService.$transaction.mockResolvedValue([100, mockAchievements]);

      const result = await service.list({ page: 3, pageSize: 10 });

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
    });
  });

  describe('getById', () => {
    it('should return an achievement by id', async () => {
      mockPrismaService.achievement.findUnique.mockResolvedValue(
        mockAchievements[0],
      );

      const result = await service.getById('ach-1');

      expect(result).toEqual(mockAchievements[0]);
      expect(mockPrismaService.achievement.findUnique).toHaveBeenCalledWith({
        where: { id: 'ach-1' },
      });
    });

    it('should throw NotFoundException if achievement not found', async () => {
      mockPrismaService.achievement.findUnique.mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
