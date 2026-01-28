import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

export class RecommendedMainStatsDto {
  @ApiPropertyOptional({ example: 'ATK%' })
  @IsOptional()
  @IsString()
  SANDS?: string;

  @ApiPropertyOptional({ example: 'Pyro DMG%' })
  @IsOptional()
  @IsString()
  GOBLET?: string;

  @ApiPropertyOptional({ example: 'Crit Rate%' })
  @IsOptional()
  @IsString()
  CIRCLET?: string;
}

export class StatWeightsDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  critRate?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  critDmg?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  atk?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  atkPercent?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  def?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  defPercent?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  hp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  hpPercent?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  em?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  er?: number;
}

export class CreateBuildDto {
  @ApiProperty({ description: 'Build name', example: '绝缘永冻甘雨' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Build description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Character ID this build is for', example: 'ganyu' })
  @IsNotEmpty()
  @IsString()
  characterId: string;

  @ApiProperty({ description: 'Whether this build is public', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ description: 'Primary artifact set ID', example: 'blizzard_strayer' })
  @IsNotEmpty()
  @IsString()
  primarySetId: string;

  @ApiPropertyOptional({ description: 'Secondary artifact set ID for 2+2 builds' })
  @IsOptional()
  @IsString()
  secondarySetId?: string;

  @ApiProperty({
    description: 'Whether to use full 4-piece set (true) or 2+2 (false)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useFullSet?: boolean;

  @ApiProperty({
    description: 'Recommended main stats for SANDS, GOBLET, CIRCLET',
    type: RecommendedMainStatsDto,
    example: { SANDS: 'ATK%', GOBLET: 'Cryo DMG%', CIRCLET: 'Crit DMG%' },
  })
  @IsNotEmpty()
  @IsObject()
  recommendedMainStats: RecommendedMainStatsDto;

  @ApiProperty({
    description: 'Sub-stat priority order',
    type: [String],
    example: ['Crit DMG%', 'Crit Rate%', 'ATK%', 'EM'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  subStatPriority: string[];

  @ApiPropertyOptional({
    description: 'Stat weights for scoring',
    type: StatWeightsDto,
  })
  @IsOptional()
  @IsObject()
  statWeights?: StatWeightsDto;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
