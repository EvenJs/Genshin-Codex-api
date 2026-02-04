import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AiChatDto {
  @ApiProperty({ description: 'User message', example: '请推荐一个适合胡桃的蒸发队伍' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Conversation ID for history continuity' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Enable streaming response', default: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
