import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class EquipArtifactsDto {
  @ApiPropertyOptional({ description: 'Artifact ID for the Flower slot (set to null to unequip)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  flowerId?: string | null;

  @ApiPropertyOptional({ description: 'Artifact ID for the Plume slot (set to null to unequip)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  plumeId?: string | null;

  @ApiPropertyOptional({ description: 'Artifact ID for the Sands slot (set to null to unequip)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  sandsId?: string | null;

  @ApiPropertyOptional({ description: 'Artifact ID for the Goblet slot (set to null to unequip)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  gobletId?: string | null;

  @ApiPropertyOptional({
    description: 'Artifact ID for the Circlet slot (set to null to unequip)',
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  circletId?: string | null;
}
