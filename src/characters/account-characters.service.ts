import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ArtifactSlot } from '@prisma/client';
import { AccountOwnershipService } from '../accounts/account-ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountCharacterDto } from './dto/create-account-character.dto';
import { UpdateAccountCharacterDto } from './dto/update-account-character.dto';
import { EquipArtifactsDto } from './dto/equip-artifacts.dto';

@Injectable()
export class AccountCharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: AccountOwnershipService,
  ) {}

  async findAll(userId: string, accountId: string) {
    await this.ownership.validate(userId, accountId);

    return this.prisma.accountCharacter.findMany({
      where: { accountId },
      orderBy: [
        { character: { rarity: 'desc' } },
        { level: 'desc' },
        { character: { name: 'asc' } },
      ],
      select: {
        id: true,
        level: true,
        constellation: true,
        createdAt: true,
        character: {
          select: {
            id: true,
            name: true,
            element: true,
            weaponType: true,
            rarity: true,
            region: true,
            imageUrl: true,
          },
        },
        artifacts: {
          select: {
            id: true,
            slot: true,
            mainStat: true,
            level: true,
            rarity: true,
            set: {
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

  async findById(userId: string, accountId: string, accountCharacterId: string) {
    await this.ownership.validate(userId, accountId);

    const accountCharacter = await this.prisma.accountCharacter.findFirst({
      where: { id: accountCharacterId, accountId },
      select: {
        id: true,
        level: true,
        constellation: true,
        createdAt: true,
        updatedAt: true,
        character: {
          select: {
            id: true,
            name: true,
            element: true,
            weaponType: true,
            rarity: true,
            region: true,
            imageUrl: true,
          },
        },
        artifacts: {
          select: {
            id: true,
            slot: true,
            mainStat: true,
            mainStatValue: true,
            subStats: true,
            level: true,
            rarity: true,
            locked: true,
            set: {
              select: {
                id: true,
                name: true,
                twoPieceBonus: true,
                fourPieceBonus: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { slot: 'asc' },
        },
      },
    });

    if (!accountCharacter) {
      throw new NotFoundException(`Character ${accountCharacterId} not found in this account`);
    }

    return accountCharacter;
  }

  async equipArtifacts(
    userId: string,
    accountId: string,
    accountCharacterId: string,
    dto: EquipArtifactsDto,
  ) {
    await this.ownership.validate(userId, accountId);

    // Verify the account character exists
    const accountCharacter = await this.prisma.accountCharacter.findFirst({
      where: { id: accountCharacterId, accountId },
    });

    if (!accountCharacter) {
      throw new NotFoundException(`Character ${accountCharacterId} not found in this account`);
    }

    const artifactIds = Object.values(dto).filter(
      (id): id is string => id !== undefined && id !== null,
    );

    // If all slots are null/undefined, unequip all artifacts from this character
    if (artifactIds.length === 0) {
      await this.prisma.userArtifact.updateMany({
        where: { equippedById: accountCharacterId },
        data: { equippedById: null },
      });

      return this.findById(userId, accountId, accountCharacterId);
    }

    // Verify all provided artifact IDs exist and belong to this account
    const artifacts = await this.prisma.userArtifact.findMany({
      where: {
        id: { in: artifactIds },
        accountId,
      },
    });

    if (artifacts.length !== artifactIds.length) {
      const foundIds = artifacts.map((a) => a.id);
      const missingIds = artifactIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Artifacts not found: ${missingIds.join(', ')}`);
    }

    // Verify slot types match
    const slotMapping: Record<keyof EquipArtifactsDto, ArtifactSlot> = {
      flowerId: ArtifactSlot.FLOWER,
      plumeId: ArtifactSlot.PLUME,
      sandsId: ArtifactSlot.SANDS,
      gobletId: ArtifactSlot.GOBLET,
      circletId: ArtifactSlot.CIRCLET,
    };

    for (const [dtoKey, expectedSlot] of Object.entries(slotMapping)) {
      const artifactId = dto[dtoKey as keyof EquipArtifactsDto];
      if (artifactId) {
        const artifact = artifacts.find((a) => a.id === artifactId);
        if (artifact && artifact.slot !== expectedSlot) {
          throw new BadRequestException(
            `Artifact ${artifactId} is a ${artifact.slot}, expected ${expectedSlot}`,
          );
        }
      }
    }

    // Perform the equipment update in a transaction
    await this.prisma.$transaction(async (tx) => {
      // First, unequip artifacts from this character that are being replaced
      const slotsToUpdate = Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => slotMapping[key as keyof EquipArtifactsDto]);

      if (slotsToUpdate.length > 0) {
        await tx.userArtifact.updateMany({
          where: {
            equippedById: accountCharacterId,
            slot: { in: slotsToUpdate },
          },
          data: { equippedById: null },
        });
      }

      // Unequip these artifacts from any other character they might be equipped to
      if (artifactIds.length > 0) {
        await tx.userArtifact.updateMany({
          where: {
            id: { in: artifactIds },
            equippedById: { not: null },
          },
          data: { equippedById: null },
        });
      }

      // Equip the new artifacts
      for (const artifactId of artifactIds) {
        await tx.userArtifact.update({
          where: { id: artifactId },
          data: { equippedById: accountCharacterId },
        });
      }
    });

    return this.findById(userId, accountId, accountCharacterId);
  }

  async create(userId: string, accountId: string, dto: CreateAccountCharacterDto) {
    await this.ownership.validate(userId, accountId);

    // Verify the character exists
    const character = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
    });

    if (!character) {
      throw new NotFoundException(`Character ${dto.characterId} not found`);
    }

    // Check if this character already exists in the account
    const existing = await this.prisma.accountCharacter.findFirst({
      where: { accountId, characterId: dto.characterId },
    });

    if (existing) {
      throw new ConflictException(
        `Character ${character.name} already exists in this account`,
      );
    }

    const created = await this.prisma.accountCharacter.create({
      data: {
        accountId,
        characterId: dto.characterId,
        level: dto.level,
        constellation: dto.constellation ?? 0,
      },
      select: {
        id: true,
        level: true,
        constellation: true,
        createdAt: true,
        character: {
          select: {
            id: true,
            name: true,
            element: true,
            weaponType: true,
            rarity: true,
            region: true,
            imageUrl: true,
          },
        },
      },
    });

    return created;
  }

  async update(
    userId: string,
    accountId: string,
    accountCharacterId: string,
    dto: UpdateAccountCharacterDto,
  ) {
    await this.ownership.validate(userId, accountId);

    // Verify the account character exists
    const existing = await this.prisma.accountCharacter.findFirst({
      where: { id: accountCharacterId, accountId },
    });

    if (!existing) {
      throw new NotFoundException(`Character ${accountCharacterId} not found in this account`);
    }

    const updated = await this.prisma.accountCharacter.update({
      where: { id: accountCharacterId },
      data: {
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.constellation !== undefined && { constellation: dto.constellation }),
      },
      select: {
        id: true,
        level: true,
        constellation: true,
        createdAt: true,
        updatedAt: true,
        character: {
          select: {
            id: true,
            name: true,
            element: true,
            weaponType: true,
            rarity: true,
            region: true,
            imageUrl: true,
          },
        },
      },
    });

    return updated;
  }

  async remove(userId: string, accountId: string, accountCharacterId: string) {
    await this.ownership.validate(userId, accountId);

    // Verify the account character exists
    const existing = await this.prisma.accountCharacter.findFirst({
      where: { id: accountCharacterId, accountId },
    });

    if (!existing) {
      throw new NotFoundException(`Character ${accountCharacterId} not found in this account`);
    }

    // Unequip all artifacts from this character before deleting
    await this.prisma.userArtifact.updateMany({
      where: { equippedById: accountCharacterId },
      data: { equippedById: null },
    });

    await this.prisma.accountCharacter.delete({
      where: { id: accountCharacterId },
    });

    return { success: true };
  }
}
