import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { AiCacheService } from './ai-cache.service';
import { AiService } from './ai.service';
import { BuildRecommendationService } from './build-recommendation.service';
import { LLM_PROVIDER } from './providers/llm-provider.interface';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AccountsModule],
  providers: [
    OllamaService,
    AiCacheService,
    AiService,
    BuildRecommendationService,
    // Register OllamaService as the LLM_PROVIDER for dependency injection
    {
      provide: LLM_PROVIDER,
      useExisting: OllamaService,
    },
  ],
  exports: [AiService, OllamaService, AiCacheService, BuildRecommendationService, LLM_PROVIDER],
})
export class AiModule {}
