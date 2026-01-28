import { Module } from '@nestjs/common';
import { GenshinApiModule } from '../genshin-api/genshin-api.module';
import { CharacterSyncController } from './character-sync.controller';
import { CharacterSyncService } from './character-sync.service';

@Module({
  imports: [GenshinApiModule],
  controllers: [CharacterSyncController],
  providers: [CharacterSyncService],
  exports: [CharacterSyncService],
})
export class CharacterSyncModule {}
