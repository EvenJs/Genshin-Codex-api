import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactSlot } from '@prisma/client';

export class OcrSubStatResult {
  @ApiProperty({ example: 'Crit Rate%' })
  stat: string;

  @ApiProperty({ example: 3.9 })
  value: number;

  @ApiProperty({ example: 0.85 })
  confidence: number;
}

export class OcrArtifactResult {
  @ApiPropertyOptional({ example: 'gladiators_finale' })
  setId?: string;

  @ApiPropertyOptional({ example: '角斗士的终幕礼' })
  setName?: string;

  @ApiPropertyOptional({ enum: ArtifactSlot, example: 'FLOWER' })
  slot?: ArtifactSlot;

  @ApiProperty({ example: 'HP' })
  mainStat: string;

  @ApiProperty({ example: 4780 })
  mainStatValue: number;

  @ApiProperty({ type: [OcrSubStatResult] })
  subStats: OcrSubStatResult[];

  @ApiProperty({ example: 20, minimum: 0, maximum: 20 })
  level: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rarity: number;

  @ApiProperty({ example: 0.75, description: 'Overall confidence score 0-1' })
  overallConfidence: number;

  @ApiProperty({ example: 'Parsed artifact from screenshot' })
  rawText: string;
}

export class OcrUploadResponseDto {
  @ApiProperty({ type: OcrArtifactResult })
  result: OcrArtifactResult;

  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ example: 'Could not determine artifact set' })
  warnings?: string[];
}
