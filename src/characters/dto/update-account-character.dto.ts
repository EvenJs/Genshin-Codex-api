import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAccountCharacterDto {
  @ApiPropertyOptional({ example: 90, minimum: 1, maximum: 90, description: 'Character level' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  level?: number;

  @ApiPropertyOptional({ example: 6, minimum: 0, maximum: 6, description: 'Constellation level (0-6)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  constellation?: number;
}
