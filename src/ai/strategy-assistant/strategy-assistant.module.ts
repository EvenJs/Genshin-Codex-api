import { Module } from '@nestjs/common';
import { AiModule } from '../ai.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StrategyAssistantService } from './strategy-assistant.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AiController } from '../ai.controller';

@Module({
  imports: [AiModule, PrismaModule],
  controllers: [AiController],
  providers: [StrategyAssistantService, KnowledgeService],
  exports: [StrategyAssistantService],
})
export class StrategyAssistantModule {}
