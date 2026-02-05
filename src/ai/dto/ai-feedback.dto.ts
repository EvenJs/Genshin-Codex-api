import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class AiFeedbackDto {
  @ApiProperty({ description: 'AI result ID to attach feedback', example: 'uuid' })
  @IsNotEmpty()
  @IsString()
  aiResultId: string;

  @ApiProperty({ description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Whether the response was helpful' })
  @IsOptional()
  @IsBoolean()
  helpful?: boolean;

  @ApiPropertyOptional({ description: 'Optional feedback comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}
