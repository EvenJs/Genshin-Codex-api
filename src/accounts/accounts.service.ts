import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountOwnershipService } from './account-ownership.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private ownership: AccountOwnershipService,
  ) {}

  async create(userId: string, dto: CreateAccountDto) {
    try {
      return await this.prisma.gameAccount.create({
        data: {
          userId,
          uid: dto.uid,
          server: dto.server,
          nickname: dto.nickname,
        },
        select: {
          id: true,
          uid: true,
          server: true,
          nickname: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Account with UID ${dto.uid} on server ${dto.server} already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.prisma.gameAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        uid: true,
        server: true,
        nickname: true,
        createdAt: true,
      },
    });
  }

  async update(userId: string, accountId: string, dto: UpdateAccountDto) {
    await this.ownership.validate(userId, accountId);

    return this.prisma.gameAccount.update({
      where: { id: accountId },
      data: { nickname: dto.nickname },
      select: {
        id: true,
        uid: true,
        server: true,
        nickname: true,
      },
    });
  }

  async remove(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    await this.prisma.gameAccount.delete({
      where: { id: accountId },
    });

    return { ok: true };
  }

  async getStats(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    const [completedCount, totalAchievements, completedProgress] = await this.prisma.$transaction([
      this.prisma.achievementProgress.count({
        where: { accountId },
      }),
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
    const primogemsEarned = completedProgress.reduce(
      (sum, p) => sum + p.achievement.rewardPrimogems,
      0,
    );

    return {
      completedCount,
      totalCount,
      incompleteCount: totalCount - completedCount,
      primogemsEarned,
      primogemsTotal,
    };
  }
}
