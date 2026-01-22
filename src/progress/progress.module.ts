import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountAchievementsController } from './account-achievements.controller';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [AccountsModule],
  controllers: [ProgressController, AccountAchievementsController],
  providers: [ProgressService],
})
export class ProgressModule {}
