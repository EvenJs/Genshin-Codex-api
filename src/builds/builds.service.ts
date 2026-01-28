import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuildDto, ListBuildsQueryDto, ListMyBuildsQueryDto, SaveBuildDto, UpdateBuildDto } from './dto';

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const buildSelect = {
  id: true,
  name: true,
  description: true,
  isPublic: true,
  useFullSet: true,
  recommendedMainStats: true,
  subStatPriority: true,
  statWeights: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  character: {
    select: {
      id: true,
      name: true,
      element: true,
      weaponType: true,
      rarity: true,
      imageUrl: true,
    },
  },
  creator: {
    select: {
      id: true,
      email: true,
    },
  },
  primarySet: {
    select: {
      id: true,
      name: true,
      twoPieceBonus: true,
      fourPieceBonus: true,
      imageUrl: true,
    },
  },
  secondarySet: {
    select: {
      id: true,
      name: true,
      twoPieceBonus: true,
      imageUrl: true,
    },
  },
  _count: {
    select: {
      savedBy: true,
    },
  },
};

@Injectable()
export class BuildsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get public builds, optionally filtered by character
   */
  async findPublicBuilds(query: ListBuildsQueryDto): Promise<PaginatedResult<any>> {
    const { characterId, page, pageSize } = query;

    const where: Prisma.ArtifactBuildWhereInput = {
      isPublic: true,
      ...(characterId ? { characterId } : {}),
    };

    const skip = (page - 1) * pageSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.artifactBuild.count({ where }),
      this.prisma.artifactBuild.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        select: buildSelect,
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        saveCount: item._count.savedBy,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get builds created by the current user
   */
  async findMyBuilds(userId: string, query: ListMyBuildsQueryDto): Promise<PaginatedResult<any>> {
    const { characterId, page, pageSize } = query;

    const where: Prisma.ArtifactBuildWhereInput = {
      creatorId: userId,
      ...(characterId ? { characterId } : {}),
    };

    const skip = (page - 1) * pageSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.artifactBuild.count({ where }),
      this.prisma.artifactBuild.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        select: buildSelect,
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        saveCount: item._count.savedBy,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get a single build by ID (must be public or owned by user)
   */
  async findById(buildId: string, userId?: string) {
    const build = await this.prisma.artifactBuild.findUnique({
      where: { id: buildId },
      select: buildSelect,
    });

    if (!build) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    // Check access: must be public or owned by the user
    if (!build.isPublic && build.creator.id !== userId) {
      throw new ForbiddenException('You do not have access to this build');
    }

    return {
      ...build,
      saveCount: build._count.savedBy,
      _count: undefined,
    };
  }

  /**
   * Create a new build
   */
  async create(userId: string, dto: CreateBuildDto) {
    // Verify character exists
    const character = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
    });
    if (!character) {
      throw new NotFoundException(`Character ${dto.characterId} not found`);
    }

    // Verify primary artifact set exists
    const primarySet = await this.prisma.artifactSet.findUnique({
      where: { id: dto.primarySetId },
    });
    if (!primarySet) {
      throw new NotFoundException(`Artifact set ${dto.primarySetId} not found`);
    }

    // Verify secondary artifact set exists if provided
    if (dto.secondarySetId) {
      const secondarySet = await this.prisma.artifactSet.findUnique({
        where: { id: dto.secondarySetId },
      });
      if (!secondarySet) {
        throw new NotFoundException(`Artifact set ${dto.secondarySetId} not found`);
      }
    }

    // If not using full set, secondary set is required
    if (dto.useFullSet === false && !dto.secondarySetId) {
      throw new BadRequestException('Secondary set is required for 2+2 builds');
    }

    const build = await this.prisma.artifactBuild.create({
      data: {
        name: dto.name,
        description: dto.description,
        characterId: dto.characterId,
        creatorId: userId,
        isPublic: dto.isPublic ?? false,
        primarySetId: dto.primarySetId,
        secondarySetId: dto.secondarySetId,
        useFullSet: dto.useFullSet ?? true,
        recommendedMainStats: dto.recommendedMainStats as Prisma.InputJsonValue,
        subStatPriority: dto.subStatPriority as Prisma.InputJsonValue,
        statWeights: dto.statWeights as Prisma.InputJsonValue,
        notes: dto.notes,
      },
      select: buildSelect,
    });

    return {
      ...build,
      saveCount: build._count.savedBy,
      _count: undefined,
    };
  }

  /**
   * Update a build (must be owned by user)
   */
  async update(userId: string, buildId: string, dto: UpdateBuildDto) {
    // Verify build exists and is owned by user
    const existing = await this.prisma.artifactBuild.findUnique({
      where: { id: buildId },
    });

    if (!existing) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    if (existing.creatorId !== userId) {
      throw new ForbiddenException('You can only update your own builds');
    }

    // Verify character exists if changing
    if (dto.characterId && dto.characterId !== existing.characterId) {
      const character = await this.prisma.character.findUnique({
        where: { id: dto.characterId },
      });
      if (!character) {
        throw new NotFoundException(`Character ${dto.characterId} not found`);
      }
    }

    // Verify primary set exists if changing
    if (dto.primarySetId && dto.primarySetId !== existing.primarySetId) {
      const primarySet = await this.prisma.artifactSet.findUnique({
        where: { id: dto.primarySetId },
      });
      if (!primarySet) {
        throw new NotFoundException(`Artifact set ${dto.primarySetId} not found`);
      }
    }

    // Verify secondary set exists if changing
    if (dto.secondarySetId && dto.secondarySetId !== existing.secondarySetId) {
      const secondarySet = await this.prisma.artifactSet.findUnique({
        where: { id: dto.secondarySetId },
      });
      if (!secondarySet) {
        throw new NotFoundException(`Artifact set ${dto.secondarySetId} not found`);
      }
    }

    // Check 2+2 configuration
    const useFullSet = dto.useFullSet ?? existing.useFullSet;
    const secondarySetId = dto.secondarySetId ?? existing.secondarySetId;
    if (!useFullSet && !secondarySetId) {
      throw new BadRequestException('Secondary set is required for 2+2 builds');
    }

    const data: Prisma.ArtifactBuildUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.characterId !== undefined) data.character = { connect: { id: dto.characterId } };
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    if (dto.primarySetId !== undefined) data.primarySet = { connect: { id: dto.primarySetId } };
    if (dto.secondarySetId !== undefined) {
      data.secondarySet = { connect: { id: dto.secondarySetId } };
    }
    if (dto.useFullSet !== undefined) data.useFullSet = dto.useFullSet;
    if (dto.recommendedMainStats !== undefined) {
      data.recommendedMainStats = dto.recommendedMainStats as Prisma.InputJsonValue;
    }
    if (dto.subStatPriority !== undefined) {
      data.subStatPriority = dto.subStatPriority as Prisma.InputJsonValue;
    }
    if (dto.statWeights !== undefined) {
      data.statWeights = dto.statWeights as Prisma.InputJsonValue;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    const build = await this.prisma.artifactBuild.update({
      where: { id: buildId },
      data,
      select: buildSelect,
    });

    return {
      ...build,
      saveCount: build._count.savedBy,
      _count: undefined,
    };
  }

  /**
   * Delete a build (must be owned by user)
   */
  async remove(userId: string, buildId: string) {
    const existing = await this.prisma.artifactBuild.findUnique({
      where: { id: buildId },
    });

    if (!existing) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    if (existing.creatorId !== userId) {
      throw new ForbiddenException('You can only delete your own builds');
    }

    await this.prisma.artifactBuild.delete({
      where: { id: buildId },
    });

    return { ok: true };
  }

  /**
   * Save a public build to user's collection
   */
  async saveBuild(userId: string, dto: SaveBuildDto) {
    // Verify build exists
    const build = await this.prisma.artifactBuild.findUnique({
      where: { id: dto.buildId },
    });

    if (!build) {
      throw new NotFoundException(`Build ${dto.buildId} not found`);
    }

    // Build must be public or owned by the user to save
    if (!build.isPublic && build.creatorId !== userId) {
      throw new ForbiddenException('You can only save public builds or your own builds');
    }

    // Check if already saved
    const existing = await this.prisma.savedBuild.findUnique({
      where: {
        userId_buildId: {
          userId,
          buildId: dto.buildId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('You have already saved this build');
    }

    const saved = await this.prisma.savedBuild.create({
      data: {
        userId,
        buildId: dto.buildId,
        notes: dto.notes,
      },
      select: {
        id: true,
        notes: true,
        createdAt: true,
        build: {
          select: buildSelect,
        },
      },
    });

    return {
      id: saved.id,
      notes: saved.notes,
      createdAt: saved.createdAt,
      build: {
        ...saved.build,
        saveCount: saved.build._count.savedBy,
        _count: undefined,
      },
    };
  }

  /**
   * Get user's saved builds
   */
  async findSavedBuilds(userId: string, query: ListMyBuildsQueryDto): Promise<PaginatedResult<any>> {
    const { characterId, page, pageSize } = query;

    const where: Prisma.SavedBuildWhereInput = {
      userId,
      ...(characterId ? { build: { characterId } } : {}),
    };

    const skip = (page - 1) * pageSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.savedBuild.count({ where }),
      this.prisma.savedBuild.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          notes: true,
          createdAt: true,
          build: {
            select: buildSelect,
          },
        },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        notes: item.notes,
        createdAt: item.createdAt,
        build: {
          ...item.build,
          saveCount: item.build._count.savedBy,
          _count: undefined,
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Remove a saved build from user's collection
   */
  async unsaveBuild(userId: string, savedBuildId: string) {
    const existing = await this.prisma.savedBuild.findFirst({
      where: { id: savedBuildId, userId },
    });

    if (!existing) {
      throw new NotFoundException(`Saved build ${savedBuildId} not found`);
    }

    await this.prisma.savedBuild.delete({
      where: { id: savedBuildId },
    });

    return { ok: true };
  }
}
