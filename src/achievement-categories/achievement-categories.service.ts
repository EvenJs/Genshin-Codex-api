import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class AchievementCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoriesQueryDto): Promise<PaginatedResult<any>> {
    const { page, pageSize, includeCount } = query;
    const skip = (page - 1) * pageSize;

    const [total, categories] = await this.prisma.$transaction([
      this.prisma.achievementCategory.count(),
      this.prisma.achievementCategory.findMany({
        skip,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...(includeCount && {
          include: {
            _count: {
              select: { achievements: true },
            },
          },
        }),
      }),
    ]);

    const items = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      title: cat.title,
      link: cat.link,
      icon: cat.icon,
      background: cat.background,
      ...(includeCount && {
        achievementCount: (cat as any)._count?.achievements ?? 0,
      }),
    }));

    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const category = await this.prisma.achievementCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { achievements: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Achievement category not found');
    }

    return {
      id: category.id,
      name: category.name,
      title: category.title,
      link: category.link,
      icon: category.icon,
      background: category.background,
      achievementCount: category._count.achievements,
    };
  }
}
