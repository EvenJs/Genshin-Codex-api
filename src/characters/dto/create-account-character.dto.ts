import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateAccountCharacterDto {
  @ApiProperty({ example: 'ayaka', description: 'Character ID from the characters table' })
  @IsString()
  @IsNotEmpty()
  characterId: string;

  @ApiProperty({ example: 90, minimum: 1, maximum: 90, description: 'Character level' })
  @IsInt()
  @Min(1)
  @Max(90)
  level: number;

  @ApiPropertyOptional({ example: 6, minimum: 0, maximum: 6, default: 0, description: 'Constellation level (0-6)' })
  @IsInt()
  @Min(0)
  @Max(6)
  constellation?: number = 0;
}
