import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import {
  LlmGenerateRequest,
  LlmChatOptions,
  LlmResponse,
} from './providers/llm-provider.interface';

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);
  private readonly cachePrefix = 'ai:';
  private readonly defaultTtl = 3600000; // 1 hour in ms

  // Stats tracking
  private hits = 0;
  private misses = 0;

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Generate a cache key for a generate request
   */
  generateCacheKey(request: LlmGenerateRequest): string {
    const payload = JSON.stringify({
      type: 'generate',
      prompt: request.prompt,
      model: request.options?.model,
      temperature: request.options?.temperature,
      maxTokens: request.options?.maxTokens,
      topP: request.options?.topP,
    });

    const hash = createHash('sha256').update(payload).digest('hex');
    return `${this.cachePrefix}gen:${hash}`;
  }

  /**
   * Generate a cache key for a chat request
   */
  chatCacheKey(options: LlmChatOptions): string {
    const payload = JSON.stringify({
      type: 'chat',
      messages: options.messages,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
    });

    const hash = createHash('sha256').update(payload).digest('hex');
    return `${this.cachePrefix}chat:${hash}`;
  }

  /**
   * Get cached response for a generate request
   */
  async getGenerateCache(
    request: LlmGenerateRequest,
  ): Promise<LlmResponse | null> {
    const key = this.generateCacheKey(request);
    const cached = await this.cacheManager.get<LlmResponse>(key);

    if (cached) {
      this.hits++;
      this.logger.debug(`Cache HIT for generate request`);
      return cached;
    }

    this.misses++;
    this.logger.debug(`Cache MISS for generate request`);
    return null;
  }

  /**
   * Cache a generate response
   */
  async setGenerateCache(
    request: LlmGenerateRequest,
    response: LlmResponse,
    ttl?: number,
  ): Promise<void> {
    const key = this.generateCacheKey(request);
    await this.cacheManager.set(key, response, ttl ?? this.defaultTtl);
    this.logger.debug(`Cached generate response`);
  }

  /**
   * Get cached response for a chat request
   */
  async getChatCache(options: LlmChatOptions): Promise<LlmResponse | null> {
    const key = this.chatCacheKey(options);
    const cached = await this.cacheManager.get<LlmResponse>(key);

    if (cached) {
      this.hits++;
      this.logger.debug(`Cache HIT for chat request`);
      return cached;
    }

    this.misses++;
    this.logger.debug(`Cache MISS for chat request`);
    return null;
  }

  /**
   * Cache a chat response
   */
  async setChatCache(
    options: LlmChatOptions,
    response: LlmResponse,
    ttl?: number,
  ): Promise<void> {
    const key = this.chatCacheKey(options);
    await this.cacheManager.set(key, response, ttl ?? this.defaultTtl);
    this.logger.debug(`Cached chat response`);
  }

  /**
   * Invalidate cache for a specific key pattern
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    // Note: cache-manager doesn't support pattern deletion natively
    // For production, consider using Redis with SCAN/DEL
    this.logger.warn(
      `Pattern invalidation requested for "${pattern}" - not supported with in-memory cache`,
    );
  }

  /**
   * Clear all AI cache
   */
  async clearAll(): Promise<void> {
    // Reset in-memory stats
    this.hits = 0;
    this.misses = 0;

    // cache-manager v5 doesn't have a native clear method for prefixed keys
    // This would work better with Redis SCAN
    this.logger.log('AI cache stats reset');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}
