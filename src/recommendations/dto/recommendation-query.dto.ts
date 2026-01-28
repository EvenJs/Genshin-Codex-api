import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecommendationQueryDto {
  @ApiPropertyOptional({
    description: 'Build ID to use for scoring weights. If not provided, uses the most popular public build for the character.',
    example: 'build-uuid',
  })
  @IsOptional()
  @IsString()
  buildId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of recommendations to return',
    default: 5,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}
