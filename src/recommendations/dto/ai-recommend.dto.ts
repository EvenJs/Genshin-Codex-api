import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BuildPreferencesDto {
  @ApiPropertyOptional({
    description: 'Prioritize damage output',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  prioritizeDamage?: boolean;

  @ApiPropertyOptional({
    description: 'Prioritize survivability',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  prioritizeSurvival?: boolean;

  @ApiPropertyOptional({
    description: 'Prioritize support capabilities',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  prioritizeSupport?: boolean;

  @ApiPropertyOptional({
    description: 'Specific role to build for',
    example: 'Main DPS',
  })
  @IsOptional()
  @IsString()
  specificRole?: string;
}

export class AiRecommendDto {
  @ApiPropertyOptional({
    description: 'Build preferences to guide AI recommendations',
    type: BuildPreferencesDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BuildPreferencesDto)
  preferences?: BuildPreferencesDto;

  @ApiPropertyOptional({
    description: 'Skip cache and generate fresh recommendations',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skipCache?: boolean;
}

export class BuildConfigDto {
  @ApiProperty({
    description: 'Name for this build configuration',
    example: 'Current Build',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Array of artifact IDs for this build',
    example: ['artifact-1', 'artifact-2', 'artifact-3', 'artifact-4', 'artifact-5'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  artifactIds: string[];
}

export class CompareBuildsDto {
  @ApiProperty({
    description: 'Build configurations to compare',
    type: [BuildConfigDto],
    minItems: 2,
    maxItems: 5,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildConfigDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  buildConfigs: BuildConfigDto[];
}

export class GenerateReasoningDto {
  @ApiProperty({
    description: 'Array of artifact IDs for the build to analyze',
    example: ['artifact-1', 'artifact-2', 'artifact-3', 'artifact-4', 'artifact-5'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  artifactIds: string[];
}

export class ApplyBuildDto {
  @ApiPropertyOptional({
    description: 'Artifact ID for FLOWER slot',
  })
  @IsOptional()
  @IsString()
  FLOWER?: string;

  @ApiPropertyOptional({
    description: 'Artifact ID for PLUME slot',
  })
  @IsOptional()
  @IsString()
  PLUME?: string;

  @ApiPropertyOptional({
    description: 'Artifact ID for SANDS slot',
  })
  @IsOptional()
  @IsString()
  SANDS?: string;

  @ApiPropertyOptional({
    description: 'Artifact ID for GOBLET slot',
  })
  @IsOptional()
  @IsString()
  GOBLET?: string;

  @ApiPropertyOptional({
    description: 'Artifact ID for CIRCLET slot',
  })
  @IsOptional()
  @IsString()
  CIRCLET?: string;
}
