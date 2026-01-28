import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { AchievementsModule } from './achievements/achievements.module';
import { ArtifactSetsModule } from './artifact-sets/artifact-sets.module';
import { AuthModule } from './auth/auth.module';
import { BuildsModule } from './builds/builds.module';
import { CharactersModule } from './characters/characters.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { UserArtifactsModule } from './user-artifacts/user-artifacts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    AuthModule,
    AccountsModule,
    AchievementsModule,
    ArtifactSetsModule,
    BuildsModule,
    CharactersModule,
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
