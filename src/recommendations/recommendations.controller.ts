import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { RecommendationQueryDto } from './dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/characters/:characterId/recommend')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @ApiOperation({
    summary: 'Get artifact recommendations for a character',
    description:
      'Returns scored and ranked artifact recommendations based on a build configuration. ' +
      'If no buildId is provided, uses the most popular public build for the character.',
  })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Character ID (e.g., "ganyu", "hutao")' })
  @ApiQuery({
    name: 'buildId',
    required: false,
    description: 'Optional build ID to use for scoring. If not provided, uses most popular build.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum artifacts per slot (default: 5, max: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Artifact recommendations with scores',
    schema: {
      type: 'object',
      properties: {
        build: {
          type: 'object',
          description: 'The build configuration used for scoring',
        },
        character: {
          type: 'object',
          description: 'Character information',
        },
        recommendations: {
          type: 'array',
          description: 'Top artifacts for each slot, sorted by score',
          items: {
            type: 'object',
            properties: {
              slot: { type: 'string', enum: ['FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET'] },
              artifacts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    artifact: { type: 'object' },
                    score: { type: 'number' },
                    mainStatMatch: { type: 'boolean' },
                    subStatScores: { type: 'array' },
                  },
                },
              },
            },
          },
        },
        optimalSet: {
          type: 'object',
          nullable: true,
          description: 'The optimal artifact combination based on set requirements',
          properties: {
            artifacts: { type: 'array' },
            totalScore: { type: 'number' },
            setBonus: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account, character, or build not found' })
  @Get()
  getRecommendations(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendationsService.getRecommendations(
      user.userId,
      accountId,
      characterId,
      query,
    );
  }
}
