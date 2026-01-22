import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @ApiProperty({ example: 'Traveler', maxLength: 40 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  nickname: string;
}
