import { Module } from '@nestjs/common';
import { AccountOwnershipService } from './account-ownership.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountOwnershipService],
  exports: [AccountOwnershipService],
})
export class AccountsModule {}
