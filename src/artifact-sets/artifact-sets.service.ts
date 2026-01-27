import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArtifactSetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.artifactSet.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        rarity: true,
        twoPieceBonus: true,
        fourPieceBonus: true,
        imageUrl: true,
      },
    });
  }

  async findById(id: string) {
    const set = await this.prisma.artifactSet.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        rarity: true,
        twoPieceBonus: true,
        fourPieceBonus: true,
        imageUrl: true,
      },
    });

    if (!set) {
      throw new NotFoundException(`Artifact set ${id} not found`);
    }

    return set;
  }
}
