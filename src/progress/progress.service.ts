import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from '../accounts/account-ownership.service';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private ownership: AccountOwnershipService,
  ) {}

  async getCompletedIds(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    const records = await this.prisma.userAchievement.findMany({
      where: {
        accountId,
        status: 'COMPLETED',
      },
      select: {
        achievementId: true,
      },
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

    // Validate achievement exists
    const achievement = await this.prisma.achievement.findUnique({
      where: { id: achievementId },
    });
    if (!achievement) {
      throw new NotFoundException(`Achievement ${achievementId} not found`);
    }

    if (completed) {
      // Upsert completed record
      await this.prisma.userAchievement.upsert({
        where: {
          accountId_achievementId: { accountId, achievementId },
        },
        create: {
          accountId,
          achievementId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    } else {
      // Delete the record if exists
      await this.prisma.userAchievement.deleteMany({
        where: { accountId, achievementId },
      });
    }

    return { ok: true };
  }
}
