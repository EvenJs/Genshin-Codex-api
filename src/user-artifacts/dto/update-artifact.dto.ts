import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactSlot } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SubStatDto } from './create-artifact.dto';

export class UpdateArtifactDto {
  @ApiPropertyOptional({ example: 'gladiators_finale', description: 'Artifact set ID' })
  @IsOptional()
  @IsString()
  setId?: string;

  @ApiPropertyOptional({ enum: ArtifactSlot, example: 'FLOWER' })
  @IsOptional()
  @IsEnum(ArtifactSlot)
  slot?: ArtifactSlot;

  @ApiPropertyOptional({ example: 'HP', description: 'Main stat type' })
  @IsOptional()
  @IsString()
  mainStat?: string;

  @ApiPropertyOptional({ example: 4780, description: 'Main stat value' })
  @IsOptional()
  @IsNumber()
  mainStatValue?: number;

  @ApiPropertyOptional({
    type: [SubStatDto],
    example: [
      { stat: 'Crit Rate%', value: 3.9 },
      { stat: 'Crit DMG%', value: 7.8 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubStatDto)
  subStats?: SubStatDto[];

  @ApiPropertyOptional({ example: 20, minimum: 0, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  level?: number;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rarity?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ example: null, description: 'Character ID to equip to, or null to unequip' })
  @IsOptional()
  @IsString()
  equippedById?: string | null;
}
