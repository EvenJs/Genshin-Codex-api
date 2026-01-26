import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ example: 'your-refresh-token-here' })
  @IsString()
  refreshToken: string;
}
