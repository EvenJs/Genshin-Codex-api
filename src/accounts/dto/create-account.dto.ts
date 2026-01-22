import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: '800000001' })
  @IsString()
  @IsNotEmpty()
  uid: string;

  @ApiProperty({ example: 'asia' })
  @IsString()
  @IsNotEmpty()
  server: string;

  @ApiPropertyOptional({ example: 'Traveler', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;
}
