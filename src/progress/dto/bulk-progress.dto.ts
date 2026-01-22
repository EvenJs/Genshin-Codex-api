import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class BulkProgressDto {
  @ApiProperty({
    description: 'Array of achievement IDs to mark as completed',
    example: ['ach-001', 'ach-002', 'ach-003'],
  })
  @IsArray()
  @IsString({ each: true })
  completedIds: string[];
}
