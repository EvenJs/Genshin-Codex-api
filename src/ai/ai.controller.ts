import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { StrategyAssistantService } from './strategy-assistant/strategy-assistant.service';
import { AiChatDto } from './strategy-assistant/dto/ai-chat.dto';

@ApiTags('AI Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly strategyAssistant: StrategyAssistantService) {}

  @ApiOperation({
    summary: 'Chat with the AI strategy assistant',
    description: 'Send a message and receive gameplay strategy guidance.',
  })
  @ApiBody({ type: AiChatDto })
  @ApiResponse({
    status: 200,
    description: 'AI chat response',
    schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        response: { type: 'string' },
        aiGenerated: { type: 'boolean' },
        knowledgeUsed: { type: 'boolean' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Post('chat')
  async chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AiChatDto,
    @Res() res: Response,
  ) {
    if (dto.stream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      try {
        for await (const event of this.strategyAssistant.chatStream(
          user.userId,
          dto.message,
          dto.conversationId,
        )) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'done' || event.type === 'error') {
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Streaming failed';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      } finally {
        res.end();
      }
      return;
    }

    const response = await this.strategyAssistant.chat(
      user.userId,
      dto.message,
      dto.conversationId,
    );

    return res.json(response);
  }
}
