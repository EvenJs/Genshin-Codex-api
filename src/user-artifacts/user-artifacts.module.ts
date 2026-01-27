import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { UserArtifactsController } from './user-artifacts.controller';
import { UserArtifactsService } from './user-artifacts.service';

@Module({
  imports: [AccountsModule],
  controllers: [UserArtifactsController],
  providers: [UserArtifactsService],
  exports: [UserArtifactsService],
})
export class UserArtifactsModule {}
