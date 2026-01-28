import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GenshinApiService } from './genshin-api.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  providers: [GenshinApiService],
  exports: [GenshinApiService],
})
export class GenshinApiModule {}
