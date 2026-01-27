import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArtifactDto } from './dto/create-artifact.dto';
import { ListArtifactsQueryDto } from './dto/list-artifacts.query.dto';
import { UpdateArtifactDto } from './dto/update-artifact.dto';

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class UserArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: AccountOwnershipService,
  ) {}

  async findAll(
    userId: string,
    accountId: string,
    query: ListArtifactsQueryDto,
  ): Promise<PaginatedResult<any>> {
    await this.ownership.validate(userId, accountId);

    const { page, pageSize, setId, slot, rarity, locked, equipped } = query;

    const where: Prisma.UserArtifactWhereInput = {
      accountId,
      ...(setId ? { setId } : {}),
      ...(slot ? { slot } : {}),
      ...(rarity ? { rarity } : {}),
      ...(typeof locked === 'boolean' ? { locked } : {}),
      ...(typeof equipped === 'boolean'
        ? equipped
          ? { equippedById: { not: null } }
          : { equippedById: null }
        : {}),
    };

    const skip = (page - 1) * pageSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.userArtifact.count({ where }),
      this.prisma.userArtifact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ rarity: 'desc' }, { level: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          slot: true,
          mainStat: true,
          mainStatValue: true,
          subStats: true,
          level: true,
          rarity: true,
          locked: true,
          equippedById: true,
          createdAt: true,
          set: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
          equippedBy: {
            select: {
              id: true,
              character: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async findById(userId: string, accountId: string, artifactId: string) {
    await this.ownership.validate(userId, accountId);

    const artifact = await this.prisma.userArtifact.findFirst({
      where: { id: artifactId, accountId },
      select: {
        id: true,
        slot: true,
        mainStat: true,
        mainStatValue: true,
        subStats: true,
        level: true,
        rarity: true,
        locked: true,
        equippedById: true,
        createdAt: true,
        updatedAt: true,
        set: {
          select: {
            id: true,
            name: true,
            twoPieceBonus: true,
            fourPieceBonus: true,
            imageUrl: true,
          },
        },
        equippedBy: {
          select: {
            id: true,
            character: {
              select: {
                id: true,
                name: true,
                element: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!artifact) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    return artifact;
  }

  async create(userId: string, accountId: string, dto: CreateArtifactDto) {
    await this.ownership.validate(userId, accountId);

    // Verify the artifact set exists
    const artifactSet = await this.prisma.artifactSet.findUnique({
      where: { id: dto.setId },
    });

    if (!artifactSet) {
      throw new NotFoundException(`Artifact set ${dto.setId} not found`);
    }

    return this.prisma.userArtifact.create({
      data: {
        accountId,
        setId: dto.setId,
        slot: dto.slot,
        mainStat: dto.mainStat,
        mainStatValue: dto.mainStatValue,
        subStats: dto.subStats as unknown as Prisma.InputJsonValue,
        level: dto.level,
        rarity: dto.rarity,
        locked: dto.locked ?? false,
      },
      select: {
        id: true,
        slot: true,
        mainStat: true,
        mainStatValue: true,
        subStats: true,
        level: true,
        rarity: true,
        locked: true,
        createdAt: true,
        set: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });
  }

  async update(userId: string, accountId: string, artifactId: string, dto: UpdateArtifactDto) {
    await this.ownership.validate(userId, accountId);

    // Verify artifact exists and belongs to this account
    const existing = await this.prisma.userArtifact.findFirst({
      where: { id: artifactId, accountId },
    });

    if (!existing) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    // If updating setId, verify the new set exists
    if (dto.setId) {
      const artifactSet = await this.prisma.artifactSet.findUnique({
        where: { id: dto.setId },
      });
      if (!artifactSet) {
        throw new NotFoundException(`Artifact set ${dto.setId} not found`);
      }
    }

    // If equipping to a character, verify the character exists and belongs to this account
    if (dto.equippedById !== undefined && dto.equippedById !== null) {
      const accountCharacter = await this.prisma.accountCharacter.findFirst({
        where: { id: dto.equippedById, accountId },
      });
      if (!accountCharacter) {
        throw new NotFoundException(`Character ${dto.equippedById} not found in this account`);
      }
    }

    const data: Prisma.UserArtifactUpdateInput = {};
    if (dto.setId !== undefined) data.set = { connect: { id: dto.setId } };
    if (dto.slot !== undefined) data.slot = dto.slot;
    if (dto.mainStat !== undefined) data.mainStat = dto.mainStat;
    if (dto.mainStatValue !== undefined) data.mainStatValue = dto.mainStatValue;
    if (dto.subStats !== undefined)
      data.subStats = dto.subStats as unknown as Prisma.InputJsonValue;
    if (dto.level !== undefined) data.level = dto.level;
    if (dto.rarity !== undefined) data.rarity = dto.rarity;
    if (dto.locked !== undefined) data.locked = dto.locked;
    if (dto.equippedById !== undefined) {
      data.equippedBy =
        dto.equippedById === null ? { disconnect: true } : { connect: { id: dto.equippedById } };
    }

    return this.prisma.userArtifact.update({
      where: { id: artifactId },
      data,
      select: {
        id: true,
        slot: true,
        mainStat: true,
        mainStatValue: true,
        subStats: true,
        level: true,
        rarity: true,
        locked: true,
        equippedById: true,
        updatedAt: true,
        set: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
        equippedBy: {
          select: {
            id: true,
            character: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async remove(userId: string, accountId: string, artifactId: string) {
    await this.ownership.validate(userId, accountId);

    // Verify artifact exists and belongs to this account
    const existing = await this.prisma.userArtifact.findFirst({
      where: { id: artifactId, accountId },
    });

    if (!existing) {
      throw new NotFoundException(`Artifact ${artifactId} not found`);
    }

    await this.prisma.userArtifact.delete({
      where: { id: artifactId },
    });

    return { ok: true };
  }

  async getStats(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    const [totalCount, equippedCount, bySlot, byRarity] = await this.prisma.$transaction([
      this.prisma.userArtifact.count({ where: { accountId } }),
      this.prisma.userArtifact.count({ where: { accountId, equippedById: { not: null } } }),
      this.prisma.userArtifact.groupBy({
        by: ['slot'],
        where: { accountId },
        orderBy: { slot: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.userArtifact.groupBy({
        by: ['rarity'],
        where: { accountId },
        orderBy: { rarity: 'desc' },
        _count: { _all: true },
      }),
    ]);

    return {
      totalCount,
      equippedCount,
      unequippedCount: totalCount - equippedCount,
      bySlot: bySlot.reduce(
        (acc, item) => {
          const count = item._count as { _all: number };
          acc[item.slot] = count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byRarity: byRarity.reduce(
        (acc, item) => {
          const count = item._count as { _all: number };
          acc[item.rarity] = count._all;
          return acc;
        },
        {} as Record<number, number>,
      ),
    };
  }
}
