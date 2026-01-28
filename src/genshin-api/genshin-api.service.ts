import { Injectable, Inject, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import {
  GenshinDevCharacter,
  GshimpactCharacter,
  GshimpactResponse,
} from './interfaces/genshin-dev-character.interface';
import {
  GENSHIN_API_ENDPOINTS,
  CACHE_KEYS,
  CACHE_TTL,
} from './constants/api-endpoints.constant';

@Injectable()
export class GenshinApiService {
  private readonly logger = new Logger(GenshinApiService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getCharacterIds(): Promise<string[]> {
    const cacheKey = CACHE_KEYS.CHARACTER_IDS;
    const cached = await this.cacheManager.get<string[]>(cacheKey);

    if (cached) {
      this.logger.debug('Character IDs cache hit');
      return cached;
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get<string[]>(GENSHIN_API_ENDPOINTS.CHARACTERS)
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(
                `Failed to fetch character list: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      await this.cacheManager.set(cacheKey, data, CACHE_TTL.CHARACTER_LIST);
      this.logger.log(`Fetched ${data.length} character IDs from API`);
      return data;
    } catch {
      this.logger.warn('Primary API failed, trying fallback');
      return this.getCharacterIdsFromFallback();
    }
  }

  async getCharacterDetail(
    id: string,
    lang = 'zh',
  ): Promise<GenshinDevCharacter> {
    const cacheKey = CACHE_KEYS.CHARACTER_DETAIL(id, lang);
    const cached = await this.cacheManager.get<GenshinDevCharacter>(cacheKey);

    if (cached) {
      this.logger.debug(`Character ${id} cache hit`);
      return cached;
    }

    const url = `${GENSHIN_API_ENDPOINTS.CHARACTER_DETAIL}/${id}?lang=${lang}`;

    const { data } = await firstValueFrom(
      this.httpService.get<GenshinDevCharacter>(url).pipe(
        catchError((error: AxiosError) => {
          this.logger.error(`Failed to fetch character ${id}: ${error.message}`);
          throw error;
        }),
      ),
    );

    await this.cacheManager.set(cacheKey, data, CACHE_TTL.CHARACTER_DETAIL);
    return data;
  }

  async getCharacterDetailWithRetry(
    id: string,
    lang = 'zh',
    maxRetries = 3,
  ): Promise<GenshinDevCharacter> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.getCharacterDetail(id, lang);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Attempt ${attempt} failed for character ${id}`);

        if (attempt < maxRetries) {
          await this.delay(1000 * attempt);
        }
      }
    }

    throw new Error(
      `Failed after ${maxRetries} retries: ${lastError?.message}`,
    );
  }

  getCharacterImageUrl(id: string): string {
    return `${GENSHIN_API_ENDPOINTS.BASE_URL}/characters/${id}/card`;
  }

  async invalidateCharacterCache(): Promise<void> {
    await this.cacheManager.del(CACHE_KEYS.CHARACTER_IDS);
    this.logger.log('Character cache invalidated');
  }

  private async getCharacterIdsFromFallback(): Promise<string[]> {
    this.logger.warn('Using fallback API (Gshimpact)');

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GshimpactResponse<GshimpactCharacter>>(
          `${GENSHIN_API_ENDPOINTS.FALLBACK_CHARACTERS}?limit=200`,
        ),
      );

      const ids = data.items.map((char) => char.id);
      await this.cacheManager.set(
        CACHE_KEYS.CHARACTER_IDS,
        ids,
        CACHE_TTL.CHARACTER_LIST,
      );

      return ids;
    } catch (error) {
      this.logger.error(`Fallback API also failed: ${(error as Error).message}`);
      throw new Error('All APIs failed to fetch character list');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
