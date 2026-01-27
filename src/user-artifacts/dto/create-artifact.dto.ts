import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactSlot } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SubStatDto {
  @ApiProperty({ example: 'Crit Rate%' })
  @IsString()
  @IsNotEmpty()
  stat: string;

  @ApiProperty({ example: 3.9 })
  @IsNumber()
  value: number;
}

export class CreateArtifactDto {
  @ApiProperty({ example: 'gladiators_finale', description: 'Artifact set ID' })
  @IsString()
  @IsNotEmpty()
  setId: string;

  @ApiProperty({ enum: ArtifactSlot, example: 'FLOWER' })
  @IsEnum(ArtifactSlot)
  slot: ArtifactSlot;

  @ApiProperty({ example: 'HP', description: 'Main stat type' })
  @IsString()
  @IsNotEmpty()
  mainStat: string;

  @ApiProperty({ example: 4780, description: 'Main stat value' })
  @IsNumber()
  mainStatValue: number;

  @ApiProperty({
    type: [SubStatDto],
    example: [
      { stat: 'Crit Rate%', value: 3.9 },
      { stat: 'Crit DMG%', value: 7.8 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubStatDto)
  subStats: SubStatDto[];

  @ApiProperty({ example: 20, minimum: 0, maximum: 20 })
  @IsInt()
  @Min(0)
  @Max(20)
  level: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rarity: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}
