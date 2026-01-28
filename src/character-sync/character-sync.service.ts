import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenshinApiService } from '../genshin-api/genshin-api.service';
import { mapGenshinDevCharacter } from '../genshin-api/mappers/character.mapper';
import { Character } from '@prisma/client';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
  timestamp: Date;
  characters?: string[];
}

@Injectable()
export class CharacterSyncService {
  private readonly logger = new Logger(CharacterSyncService.name);
  private lastSyncResult: SyncResult | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly genshinApi: GenshinApiService,
  ) {}

  async syncAllCharacters(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
      timestamp: new Date(),
      characters: [],
    };

    try {
      const characterIds = await this.genshinApi.getCharacterIds();
      this.logger.log(`Found ${characterIds.length} characters to sync`);

      const batchSize = 5;
      for (let i = 0; i < characterIds.length; i += batchSize) {
        const batch = characterIds.slice(i, i + batchSize);

        const results = await Promise.allSettled(
          batch.map((id) => this.syncSingleCharacter(id)),
        );

        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          const charId = batch[j];

          if (res.status === 'fulfilled') {
            result.synced++;
            result.characters?.push(charId);
          } else {
            result.failed++;
            result.errors.push(`${charId}: ${res.reason?.message ?? 'Unknown error'}`);
          }
        }

        if (i + batchSize < characterIds.length) {
          await this.delay(500);
        }

        this.logger.log(
          `Progress: ${Math.min(i + batchSize, characterIds.length)}/${characterIds.length}`,
        );
      }

      result.success = result.failed === 0;
      this.logger.log(
        `Sync completed: ${result.synced} synced, ${result.failed} failed`,
      );
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
      this.logger.error(`Sync failed: ${(error as Error).message}`);
    }

    this.lastSyncResult = result;
    return result;
  }

  async syncCharacter(id: string): Promise<{ ok: boolean; character?: Character; error?: string }> {
    try {
      const character = await this.syncSingleCharacter(id);
      return { ok: true, character };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  private async syncSingleCharacter(id: string): Promise<Character> {
    const detail = await this.genshinApi.getCharacterDetailWithRetry(id, 'zh');
    const characterData = mapGenshinDevCharacter(id, detail);

    return this.prisma.character.upsert({
      where: { id },
      update: {
        name: characterData.name,
        element: characterData.element,
        weaponType: characterData.weaponType,
        rarity: characterData.rarity,
        region: characterData.region,
        imageUrl: characterData.imageUrl,
      },
      create: characterData,
    });
  }

  getLastSyncStatus(): SyncResult | { message: string } {
    return this.lastSyncResult ?? { message: 'No sync has been performed yet' };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
