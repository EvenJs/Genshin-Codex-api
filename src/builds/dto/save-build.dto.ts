import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveBuildDto {
  @ApiProperty({ description: 'Build ID to save' })
  @IsNotEmpty()
  @IsString()
  buildId: string;

  @ApiPropertyOptional({ description: 'Personal notes about this build' })
  @IsOptional()
  @IsString()
  notes?: string;
}
