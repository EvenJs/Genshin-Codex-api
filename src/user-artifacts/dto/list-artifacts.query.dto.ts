import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactSlot } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

export class ListArtifactsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => toInt(value, 1))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(({ value }) => toInt(value, 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ example: 'gladiators_finale', description: 'Filter by artifact set ID' })
  @IsOptional()
  @IsString()
  setId?: string;

  @ApiPropertyOptional({ enum: ArtifactSlot, description: 'Filter by slot' })
  @IsOptional()
  @IsEnum(ArtifactSlot)
  slot?: ArtifactSlot;

  @ApiPropertyOptional({ example: 5, description: 'Filter by rarity' })
  @IsOptional()
  @Transform(({ value }) => toInt(value, 0))
  @IsInt()
  @Min(1)
  @Max(5)
  rarity?: number;

  @ApiPropertyOptional({ example: false, description: 'Filter locked artifacts' })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Filter equipped/unequipped artifacts' })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  equipped?: boolean;
}
