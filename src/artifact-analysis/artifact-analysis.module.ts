import { Module } from '@nestjs/common';
import { ArtifactAnalysisService } from './artifact-analysis.service';
import { ArtifactAnalysisController } from './artifact-analysis.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [PrismaModule, AiModule, AccountsModule],
  controllers: [ArtifactAnalysisController],
  providers: [ArtifactAnalysisService],
  exports: [ArtifactAnalysisService],
})
export class ArtifactAnalysisModule {}
