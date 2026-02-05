import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';
import { AiCacheService, CacheStats } from './ai-cache.service';
import {
  LlmGenerateRequest,
  LlmResponse,
  LlmChatOptions,
  LlmStreamChunk,
} from './providers/llm-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * High-level AI service that wraps the LLM provider with caching
 * This is the main entry point for AI functionality in the application
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly dailyRequestLimit: number;
  private readonly dailyTokenLimit: number;
  private readonly usageTimezone: string;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly cacheService: AiCacheService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.dailyRequestLimit = Number(this.configService.get('AI_DAILY_REQUEST_LIMIT', 50));
    this.dailyTokenLimit = Number(this.configService.get('AI_DAILY_TOKEN_LIMIT', 200000));
    this.usageTimezone = this.configService.get<string>('AI_USAGE_TIMEZONE', 'UTC');
  }

  /**
   * Check if AI services are available
   */
  async isAvailable(): Promise<boolean> {
    return this.ollamaService.isAvailable();
  }

  /**
   * Generate a completion with caching
   */
  async generate(
    request: LlmGenerateRequest,
    useCache = true,
  ): Promise<LlmResponse> {
    // Check cache first
    if (useCache) {
      const cached = await this.cacheService.getGenerateCache(request);
      if (cached) {
        return cached;
      }
    }

    // Generate fresh response
    const response = await this.ollamaService.generate(request);

    // Cache the response
    if (useCache) {
      await this.cacheService.setGenerateCache(request, response);
    }

    return response;
  }

  /**
   * Chat completion with caching
   */
  async chat(options: LlmChatOptions, useCache = true): Promise<LlmResponse> {
    // Check cache first
    if (useCache) {
      const cached = await this.cacheService.getChatCache(options);
      if (cached) {
        return cached;
      }
    }

    // Generate fresh response
    const response = await this.ollamaService.chat(options);

    // Cache the response
    if (useCache) {
      await this.cacheService.setChatCache(options, response);
    }

    return response;
  }

  /**
   * Generate streaming completion (not cached)
   */
  generateStream(
    request: LlmGenerateRequest,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    return this.ollamaService.generateStream(request);
  }

  /**
   * Chat streaming completion (not cached)
   */
  chatStream(
    options: LlmChatOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    return this.ollamaService.chatStream(options);
  }

  /**
   * Get available models
   */
  async listModels(): Promise<string[]> {
    return this.ollamaService.listModels();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cacheService.getStats();
  }

  /**
   * Simple prompt helper for common use cases
   */
  async prompt(text: string, model?: string): Promise<string> {
    const response = await this.generate({
      prompt: text,
      options: { model },
    });
    return response.content;
  }

  async chatForUser(
    userId: string,
    options: LlmChatOptions,
    useCache = true,
  ): Promise<LlmResponse> {
    const usageDate = await this.assertUsageAllowed(userId);
    const response = await this.chat(options, useCache);
    await this.recordUsage(userId, usageDate, response.totalTokens ?? 0);
    return response;
  }

  async generateForUser(
    userId: string,
    request: LlmGenerateRequest,
    useCache = true,
  ): Promise<LlmResponse> {
    const usageDate = await this.assertUsageAllowed(userId);
    const response = await this.generate(request, useCache);
    await this.recordUsage(userId, usageDate, response.totalTokens ?? 0);
    return response;
  }

  async *chatStreamForUser(
    userId: string,
    options: LlmChatOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const usageDate = await this.assertUsageAllowed(userId);
    await this.recordUsage(userId, usageDate, 0);
    for await (const chunk of this.chatStream(options)) {
      yield chunk;
    }
  }

  async getUsageStats(userId: string) {
    const date = this.getUsageDate();
    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_date: { userId, date } },
    });
    return {
      date: date.toISOString(),
      requestCount: usage?.requestCount ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      requestLimit: this.dailyRequestLimit,
      tokenLimit: this.dailyTokenLimit,
      timeZone: this.usageTimezone,
    };
  }

  private async assertUsageAllowed(userId: string): Promise<Date> {
    if (this.dailyRequestLimit <= 0 && this.dailyTokenLimit <= 0) {
      return this.getUsageDate();
    }

    const date = this.getUsageDate();
    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_date: { userId, date } },
    });

    const requests = usage?.requestCount ?? 0;
    const tokens = usage?.totalTokens ?? 0;

    if (this.dailyRequestLimit > 0 && requests >= this.dailyRequestLimit) {
      throw new HttpException('AI request limit reached for today', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (this.dailyTokenLimit > 0 && tokens >= this.dailyTokenLimit) {
      throw new HttpException('AI token limit reached for today', HttpStatus.TOO_MANY_REQUESTS);
    }

    return date;
  }

  private async recordUsage(userId: string, date: Date, tokens: number) {
    await this.prisma.aiUsage.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        requestCount: 1,
        totalTokens: tokens,
      },
      update: {
        requestCount: { increment: 1 },
        totalTokens: { increment: tokens },
      },
    });
  }

  private getUsageDate(): Date {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.usageTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const year = Number(parts.find((p) => p.type === 'year')?.value ?? '1970');
      const month = Number(parts.find((p) => p.type === 'month')?.value ?? '01');
      const day = Number(parts.find((p) => p.type === 'day')?.value ?? '01');
      return new Date(Date.UTC(year, month - 1, day));
    } catch {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
  }
}
