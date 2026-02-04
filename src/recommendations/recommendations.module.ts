import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AiModule } from '../ai/ai.module';
import { RecommendationsController } from './recommendations.controller';
import { AiBuildRecommendationController } from './ai-build-recommendation.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AccountsModule, AiModule],
  controllers: [RecommendationsController, AiBuildRecommendationController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
