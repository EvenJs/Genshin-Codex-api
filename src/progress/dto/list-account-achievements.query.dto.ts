import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export enum ProgressStatusFilter {
  COMPLETED = 'completed',
  INCOMPLETE = 'incomplete',
  ALL = 'all',
}

export class ListAccountAchievementsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => toInt(value, 1))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => toInt(value, 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ enum: ProgressStatusFilter, default: 'all' })
  @IsOptional()
  @IsEnum(ProgressStatusFilter)
  status: ProgressStatusFilter = ProgressStatusFilter.ALL;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ description: 'Search in name/description' })
  @IsOptional()
  @IsString()
  q?: string;
}
