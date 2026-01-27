import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.character.findMany({
      orderBy: [{ rarity: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        region: true,
        imageUrl: true,
      },
    });
  }

  async findById(id: string) {
    const character = await this.prisma.character.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        region: true,
        imageUrl: true,
      },
    });

    if (!character) {
      throw new NotFoundException(`Character ${id} not found`);
    }

    return character;
  }
}
