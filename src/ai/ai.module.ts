import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { AiCacheService } from './ai-cache.service';
import { AiService } from './ai.service';
import { LLM_PROVIDER } from './providers/llm-provider.interface';

@Module({
  providers: [
    OllamaService,
    AiCacheService,
    AiService,
    // Register OllamaService as the LLM_PROVIDER for dependency injection
    {
      provide: LLM_PROVIDER,
      useExisting: OllamaService,
    },
  ],
  exports: [AiService, OllamaService, AiCacheService, LLM_PROVIDER],
})
export class AiModule {}
