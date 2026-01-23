import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import {
  ListAccountAchievementsQueryDto,
  ProgressStatusFilter,
} from './dto/list-account-achievements.query.dto';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private ownership: AccountOwnershipService,
  ) {}

  async getCompletedIds(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    const records = await this.prisma.achievementProgress.findMany({
      where: { accountId },
      select: { achievementId: true },
    });

    return {
      completedIds: records.map((r) => r.achievementId),
    };
  }

  async updateProgress(
    userId: string,
    accountId: string,
    achievementId: string,
    completed: boolean,
  ) {
    await this.ownership.validate(userId, accountId);

    if (completed) {
      await this.prisma.achievementProgress.upsert({
        where: { accountId_achievementId: { accountId, achievementId } },
        create: { accountId, achievementId, completedAt: new Date() },
        update: { completedAt: new Date() },
      });
    } else {
      await this.prisma.achievementProgress.deleteMany({
        where: { accountId, achievementId },
      });
    }

    return { ok: true };
  }

  async bulkUpdate(userId: string, accountId: string, completedIds: string[]) {
    await this.ownership.validate(userId, accountId);

    if (completedIds.length === 0) {
      return { ok: true, upserted: 0 };
    }

    const now = new Date();

    await this.prisma.$transaction(
      completedIds.map((achievementId) =>
        this.prisma.achievementProgress.upsert({
          where: { accountId_achievementId: { accountId, achievementId } },
          create: { accountId, achievementId, completedAt: now },
          update: { completedAt: now },
        }),
      ),
    );

    return { ok: true, upserted: completedIds.length };
  }

  async listWithProgress(
    userId: string,
    accountId: string,
    query: ListAccountAchievementsQueryDto,
  ) {
    await this.ownership.validate(userId, accountId);

    const { page, pageSize, status, category, region, isHidden, version, q } = query;

    // Get all completed achievement IDs for this account
    const completedRecords = await this.prisma.achievementProgress.findMany({
      where: { accountId },
      select: { achievementId: true, completedAt: true },
    });
    const completedMap = new Map(
      completedRecords.map((r) => [r.achievementId, r.completedAt]),
    );

    // Build base where clause for achievements
    const baseWhere: Prisma.AchievementWhereInput = {
      ...(category ? { category } : {}),
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

    // Apply status filter
    let where: Prisma.AchievementWhereInput = baseWhere;
    const completedIds = [...completedMap.keys()];

    if (status === ProgressStatusFilter.COMPLETED) {
      where = { ...baseWhere, id: { in: completedIds } };
    } else if (status === ProgressStatusFilter.INCOMPLETE) {
      where = { ...baseWhere, id: { notIn: completedIds } };
    }

    const skip = (page - 1) * pageSize;

    // Get paginated items and total
    const [items, total] = await this.prisma.$transaction([
      this.prisma.achievement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.achievement.count({ where }),
    ]);

    // Get stats (全量统计，不受 filter 影响)
    const [totalAchievements, completedProgressWithRewards] =
      await this.prisma.$transaction([
        this.prisma.achievement.aggregate({
          _count: true,
          _sum: { rewardPrimogems: true },
        }),
        this.prisma.achievementProgress.findMany({
          where: { accountId },
          select: { achievement: { select: { rewardPrimogems: true } } },
        }),
      ]);

    const totalCount = totalAchievements._count;
    const primogemsTotal = totalAchievements._sum.rewardPrimogems ?? 0;
    const completedCount = completedProgressWithRewards.length;
    const incompleteCount = totalCount - completedCount;
    const primogemsEarned = completedProgressWithRewards.reduce(
      (sum, p) => sum + p.achievement.rewardPrimogems,
      0,
    );

    // Map items with completion status
    const itemsWithProgress = items.map((achievement) => ({
      ...achievement,
      completed: completedMap.has(achievement.id),
      completedAt: completedMap.get(achievement.id) ?? null,
    }));

    return {
      items: itemsWithProgress,
      total,
      page,
      pageSize,
      stats: {
        completedCount,
        incompleteCount,
        totalCount,
        primogemsEarned,
        primogemsTotal,
      },
    };
  }
}
