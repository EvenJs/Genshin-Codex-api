import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateProgressDto {
  @ApiProperty({ description: 'Whether the achievement is completed' })
  @IsBoolean()
  completed: boolean;
}
