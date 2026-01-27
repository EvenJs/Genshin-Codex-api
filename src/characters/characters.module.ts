import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountCharactersController } from './account-characters.controller';
import { AccountCharactersService } from './account-characters.service';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';

@Module({
  imports: [AccountsModule],
  controllers: [CharactersController, AccountCharactersController],
  providers: [CharactersService, AccountCharactersService],
  exports: [CharactersService, AccountCharactersService],
})
export class CharactersModule {}
