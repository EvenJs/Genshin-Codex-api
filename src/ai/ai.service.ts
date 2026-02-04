import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { AiCacheService, CacheStats } from './ai-cache.service';
import {
  LlmGenerateRequest,
  LlmResponse,
  LlmChatOptions,
  LlmStreamChunk,
} from './providers/llm-provider.interface';

/**
 * High-level AI service that wraps the LLM provider with caching
 * This is the main entry point for AI functionality in the application
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly cacheService: AiCacheService,
  ) {}

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
}
