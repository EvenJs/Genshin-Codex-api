import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAchievementsQueryDto } from './dto/list-achievements.query.dto';

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAchievementsQueryDto): Promise<PaginatedResult<any>> {
    const { page, pageSize, category, categoryId, region, isHidden, version, q } = query;

    const where: Prisma.AchievementWhereInput = {
      ...(category ? { category: { name: category } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(region ? { region } : {}),
      ...(version ? { version } : {}),
      ...(typeof isHidden === 'boolean' ? { isHidden } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.achievement.count({ where }),
      this.prisma.achievement.findMany({
        where,
        skip,
        take,
        orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
        include: { category: { select: { name: true, title: true } } },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const achievement = await this.prisma.achievement.findUnique({ where: { id } });
    if (!achievement) {
      throw new NotFoundException('Achievement not found');
    }
    return achievement;
  }
}
