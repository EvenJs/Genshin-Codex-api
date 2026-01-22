import { Injectable } from '@nestjs/common';
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
}
