import { Module } from '@nestjs/common';
import { AchievementCategoriesController } from './achievement-categories.controller';
import { AchievementCategoriesService } from './achievement-categories.service';

@Module({
  controllers: [AchievementCategoriesController],
  providers: [AchievementCategoriesService],
  exports: [AchievementCategoriesService],
})
export class AchievementCategoriesModule {}
