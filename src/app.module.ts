import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { AchievementCategoriesModule } from './achievement-categories/achievement-categories.module';
import { AchievementsModule } from './achievements/achievements.module';
import { AiModule } from './ai/ai.module';
import { ArtifactSetsModule } from './artifact-sets/artifact-sets.module';
import { AuthModule } from './auth/auth.module';
import { BuildsModule } from './builds/builds.module';
import { CharactersModule } from './characters/characters.module';
import { CharacterSyncModule } from './character-sync/character-sync.module';
import { GenshinApiModule } from './genshin-api/genshin-api.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { UserArtifactsModule } from './user-artifacts/user-artifacts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({
      isGlobal: true,
      ttl: 3600000, // 1 hour default
      max: 500,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60000, // 1 minute
          limit: 100, // 100 requests per minute
        },
      ],
    }),
    PrismaModule,
    AiModule,
    AuthModule,
    AccountsModule,
    AchievementCategoriesModule,
    AchievementsModule,
    ArtifactSetsModule,
    BuildsModule,
    CharactersModule,
    CharacterSyncModule,
    GenshinApiModule,
    ProgressModule,
    RecommendationsModule,
    UserArtifactsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
