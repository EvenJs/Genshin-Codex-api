import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama } from 'ollama';
import {
  LlmProvider,
  LlmGenerateRequest,
  LlmResponse,
  LlmChatOptions,
  LlmStreamChunk,
} from './providers/llm-provider.interface';

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class OllamaService implements LlmProvider, OnModuleInit {
  private readonly logger = new Logger(OllamaService.name);
  private client: Ollama;
  private readonly defaultModel: string;
  private readonly host: string;

  // Rate limiting configuration
  private readonly maxTokensPerMinute: number;
  private readonly refillRate: number;
  private rateLimitState: RateLimitState;

  // Retry configuration
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>(
      'OLLAMA_HOST',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_MODEL',
      'llama3.2',
    );
    this.maxTokensPerMinute = this.configService.get<number>(
      'OLLAMA_RATE_LIMIT',
      60,
    );

    this.client = new Ollama({ host: this.host });

    // Initialize rate limiter (token bucket algorithm)
    this.refillRate = this.maxTokensPerMinute / 60; // tokens per second
    this.rateLimitState = {
      tokens: this.maxTokensPerMinute,
      lastRefill: Date.now(),
    };
  }

  async onModuleInit() {
    const available = await this.isAvailable();
    if (available) {
      this.logger.log(`Ollama connected at ${this.host}`);
      const models = await this.listModels();
      this.logger.log(`Available models: ${models.join(', ') || 'none'}`);
    } else {
      this.logger.warn(
        `Ollama not available at ${this.host}. AI features will be disabled.`,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.list();
      return response.models.map((m) => m.name);
    } catch (error) {
      this.logger.error('Failed to list models', error);
      return [];
    }
  }

  async generate(request: LlmGenerateRequest): Promise<LlmResponse> {
    await this.acquireRateLimitToken();

    const model = request.options?.model ?? this.defaultModel;

    return this.withRetry(async () => {
      const response = await this.client.generate({
        model,
        prompt: request.prompt,
        options: {
          temperature: request.options?.temperature,
          top_p: request.options?.topP,
          num_predict: request.options?.maxTokens,
          stop: request.options?.stop,
        },
      });

      return {
        content: response.response,
        model: response.model,
        promptTokens: response.prompt_eval_count,
        completionTokens: response.eval_count,
        totalTokens:
          (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      };
    });
  }

  async chat(options: LlmChatOptions): Promise<LlmResponse> {
    await this.acquireRateLimitToken();

    const model = options.model ?? this.defaultModel;

    return this.withRetry(async () => {
      const response = await this.client.chat({
        model,
        messages: options.messages,
        options: {
          temperature: options.temperature,
          top_p: options.topP,
          num_predict: options.maxTokens,
          stop: options.stop,
        },
      });

      return {
        content: response.message.content,
        model: response.model,
        promptTokens: response.prompt_eval_count,
        completionTokens: response.eval_count,
        totalTokens:
          (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      };
    });
  }

  async *generateStream(
    request: LlmGenerateRequest,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    await this.acquireRateLimitToken();

    const model = request.options?.model ?? this.defaultModel;

    const stream = await this.client.generate({
      model,
      prompt: request.prompt,
      stream: true,
      options: {
        temperature: request.options?.temperature,
        top_p: request.options?.topP,
        num_predict: request.options?.maxTokens,
        stop: request.options?.stop,
      },
    });

    for await (const chunk of stream) {
      yield {
        content: chunk.response,
        done: chunk.done,
      };
    }
  }

  async *chatStream(
    options: LlmChatOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    await this.acquireRateLimitToken();

    const model = options.model ?? this.defaultModel;

    const stream = await this.client.chat({
      model,
      messages: options.messages,
      stream: true,
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        num_predict: options.maxTokens,
        stop: options.stop,
      },
    });

    for await (const chunk of stream) {
      yield {
        content: chunk.message.content,
        done: chunk.done,
      };
    }
  }

  // Rate limiting implementation (token bucket algorithm)
  private async acquireRateLimitToken(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.rateLimitState.lastRefill) / 1000;

    // Refill tokens based on elapsed time
    this.rateLimitState.tokens = Math.min(
      this.maxTokensPerMinute,
      this.rateLimitState.tokens + elapsed * this.refillRate,
    );
    this.rateLimitState.lastRefill = now;

    if (this.rateLimitState.tokens < 1) {
      // Wait until we have a token
      const waitTime = ((1 - this.rateLimitState.tokens) / this.refillRate) * 1000;
      this.logger.debug(`Rate limited, waiting ${waitTime.toFixed(0)}ms`);
      await this.sleep(waitTime);
      this.rateLimitState.tokens = 1;
      this.rateLimitState.lastRefill = Date.now();
    }

    this.rateLimitState.tokens -= 1;
  }

  // Retry logic with exponential backoff
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === this.maxRetries) {
          this.logger.error(
            `Ollama request failed after ${attempt} attempts: ${lastError.message}`,
          );
          throw this.wrapError(lastError);
        }

        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Ollama request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms: ${lastError.message}`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on connection errors, timeouts, and 5xx errors
      return (
        message.includes('econnrefused') ||
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        message.includes('socket hang up') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }

  private wrapError(error: Error): Error {
    const message = error.message.toLowerCase();

    if (message.includes('econnrefused')) {
      return new Error(
        `Ollama service unavailable at ${this.host}. Please ensure Ollama is running.`,
      );
    }

    if (message.includes('model') && message.includes('not found')) {
      return new Error(
        `Model "${this.defaultModel}" not found. Please pull the model first: ollama pull ${this.defaultModel}`,
      );
    }

    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
