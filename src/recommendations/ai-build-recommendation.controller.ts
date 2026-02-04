import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ArtifactSlot } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { BuildRecommendationService } from '../ai/build-recommendation.service';
import {
  AiRecommendDto,
  CompareBuildsDto,
  GenerateReasoningDto,
  ApplyBuildDto,
} from './dto';

@ApiTags('AI Build Recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/characters/:characterId')
export class AiBuildRecommendationController {
  constructor(
    private readonly buildRecommendationService: BuildRecommendationService,
  ) {}

  @ApiOperation({
    summary: 'Get AI-powered build recommendations',
    description:
      'Uses AI to analyze your artifact inventory and recommend optimal builds for the character. ' +
      'Returns multiple build options with detailed reasoning and artifact selections.',
  })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Character ID (e.g., "ganyu", "hutao")' })
  @ApiBody({ type: AiRecommendDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'AI-generated build recommendations',
    schema: {
      type: 'object',
      properties: {
        character: {
          type: 'object',
          description: 'Character information',
        },
        builds: {
          type: 'array',
          description: 'Recommended builds sorted by priority',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'number' },
              setConfiguration: { type: 'object' },
              recommendedMainStats: { type: 'object' },
              subStatPriority: { type: 'array', items: { type: 'string' } },
              selectedArtifacts: { type: 'object' },
              totalScore: { type: 'number' },
              statSummary: { type: 'object' },
              reasoning: { type: 'string' },
              improvements: { type: 'array', items: { type: 'string' } },
              viability: { type: 'string', enum: ['excellent', 'good', 'workable', 'needs-improvement'] },
            },
          },
        },
        overallAnalysis: {
          type: 'object',
          properties: {
            inventoryQuality: { type: 'string' },
            bestBuildIndex: { type: 'number' },
            farmingSuggestions: { type: 'array', items: { type: 'string' } },
            keyMissingPieces: { type: 'array', items: { type: 'string' } },
          },
        },
        generatedAt: { type: 'string', format: 'date-time' },
        aiGenerated: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or character not found' })
  @Post('ai-recommend')
  getAiRecommendations(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Body() dto: AiRecommendDto = {},
  ) {
    return this.buildRecommendationService.getRecommendations(
      user.userId,
      accountId,
      characterId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Compare multiple build configurations',
    description:
      'Compare different artifact combinations to determine which build performs best. ' +
      'Analyzes damage potential, consistency, and situational effectiveness.',
  })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Character ID' })
  @ApiBody({ type: CompareBuildsDto })
  @ApiResponse({
    status: 200,
    description: 'Build comparison results',
    schema: {
      type: 'object',
      properties: {
        comparison: {
          type: 'object',
          properties: {
            builds: { type: 'array' },
            winner: { type: 'object' },
            situationalNotes: { type: 'object' },
            improvements: { type: 'array' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account, character, or artifacts not found' })
  @Post('ai-compare')
  compareBuilds(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Body() dto: CompareBuildsDto,
  ) {
    return this.buildRecommendationService.compareBuilds(
      user.userId,
      accountId,
      characterId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Generate detailed reasoning for a build',
    description:
      'Get in-depth analysis explaining why specific artifacts work for a character. ' +
      'Includes set synergy analysis, main stat evaluation, and sub-stat assessment.',
  })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Character ID' })
  @ApiBody({ type: GenerateReasoningDto })
  @ApiResponse({
    status: 200,
    description: 'Detailed build reasoning',
    schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'object',
          properties: {
            setChoice: { type: 'object' },
            mainStats: { type: 'object' },
            subStats: { type: 'object' },
            synergy: { type: 'object' },
            overallVerdict: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account, character, or artifacts not found' })
  @Post('ai-reasoning')
  generateReasoning(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Body() dto: GenerateReasoningDto,
  ) {
    return this.buildRecommendationService.generateReasoning(
      user.userId,
      accountId,
      characterId,
      dto.artifactIds,
    );
  }

  @ApiOperation({
    summary: 'Apply recommended build to character',
    description:
      'Equip the recommended artifacts on the character. ' +
      'Automatically handles unequipping from previous character if needed.',
  })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Character ID' })
  @ApiBody({ type: ApplyBuildDto })
  @ApiResponse({
    status: 200,
    description: 'Build application result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        equipped: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of successfully equipped artifacts',
        },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Error messages for failed equips',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account or character not found' })
  @Post('apply-build')
  applyBuild(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Body() dto: ApplyBuildDto,
  ) {
    const artifactSelections: Record<ArtifactSlot, string | null> = {
      FLOWER: dto.FLOWER || null,
      PLUME: dto.PLUME || null,
      SANDS: dto.SANDS || null,
      GOBLET: dto.GOBLET || null,
      CIRCLET: dto.CIRCLET || null,
    };

    return this.buildRecommendationService.applyBuild(
      user.userId,
      accountId,
      characterId,
      artifactSelections,
    );
  }
}
