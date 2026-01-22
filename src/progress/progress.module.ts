import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [AccountsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
