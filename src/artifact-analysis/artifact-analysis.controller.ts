import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { ArtifactAnalysisService } from './artifact-analysis.service';
import {
  AnalyzeArtifactDto,
  BatchAnalyzeDto,
  ArtifactAnalysisResult,
  BatchAnalysisResult,
  PotentialEvaluationResult,
} from './dto';

@ApiTags('Artifact Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/artifacts')
export class ArtifactAnalysisController {
  constructor(private readonly analysisService: ArtifactAnalysisService) {}

  @ApiOperation({ summary: 'Analyze a single artifact with AI' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'artifactId', description: 'Artifact ID to analyze' })
  @ApiQuery({ name: 'characterId', required: false, description: 'Target character for context-aware analysis' })
  @ApiQuery({ name: 'skipCache', required: false, type: Boolean, description: 'Skip cache and force fresh analysis' })
  @ApiResponse({ status: 200, description: 'Artifact analysis result', type: ArtifactAnalysisResult })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifact not found' })
  @Post(':artifactId/analyze')
  analyzeArtifact(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('artifactId') artifactId: string,
    @Query('characterId') characterId?: string,
    @Query('skipCache') skipCache?: boolean,
  ): Promise<ArtifactAnalysisResult> {
    return this.analysisService.analyzeArtifact(
      user.userId,
      accountId,
      artifactId,
      characterId,
      skipCache === true,
    );
  }

  @ApiOperation({ summary: 'Get artifact upgrade potential evaluation' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'artifactId', description: 'Artifact ID to evaluate' })
  @ApiResponse({ status: 200, description: 'Potential evaluation result', type: PotentialEvaluationResult })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifact not found' })
  @Get(':artifactId/potential')
  evaluatePotential(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('artifactId') artifactId: string,
  ): Promise<PotentialEvaluationResult> {
    return this.analysisService.evaluatePotential(user.userId, accountId, artifactId);
  }

  @ApiOperation({ summary: 'Batch analyze multiple artifacts' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 200, description: 'Batch analysis result', type: BatchAnalysisResult })
  @ApiResponse({ status: 400, description: 'No artifact IDs provided or too many artifacts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifacts not found' })
  @Post('batch-analyze')
  batchAnalyze(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: BatchAnalyzeDto,
  ): Promise<BatchAnalysisResult> {
    return this.analysisService.batchAnalyze(
      user.userId,
      accountId,
      dto.artifactIds,
      dto.characterId,
    );
  }
}
