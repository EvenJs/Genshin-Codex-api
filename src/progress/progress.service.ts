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
}
