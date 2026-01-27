import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ArtifactSlot } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateArtifactDto } from './dto/create-artifact.dto';
import { ListArtifactsQueryDto } from './dto/list-artifacts.query.dto';
import { UpdateArtifactDto } from './dto/update-artifact.dto';
import { UserArtifactsService } from './user-artifacts.service';

@ApiTags('User Artifacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/artifacts')
export class UserArtifactsController {
  constructor(private readonly userArtifactsService: UserArtifactsService) {}

  @ApiOperation({ summary: 'List artifacts for an account' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'setId', required: false, type: String })
  @ApiQuery({ name: 'slot', required: false, enum: ArtifactSlot })
  @ApiQuery({ name: 'rarity', required: false, type: Number })
  @ApiQuery({ name: 'locked', required: false, type: Boolean })
  @ApiQuery({ name: 'equipped', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Paginated list of artifacts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Query() query: ListArtifactsQueryDto,
  ) {
    return this.userArtifactsService.findAll(user.userId, accountId, query);
  }

  @ApiOperation({ summary: 'Get artifact statistics for an account' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 200, description: 'Artifact statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload, @Param('accountId') accountId: string) {
    return this.userArtifactsService.getStats(user.userId, accountId);
  }

  @ApiOperation({ summary: 'Get artifact by ID' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'artifactId', description: 'Artifact ID' })
  @ApiResponse({ status: 200, description: 'Artifact details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifact not found' })
  @Get(':artifactId')
  findById(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.userArtifactsService.findById(user.userId, accountId, artifactId);
  }

  @ApiOperation({ summary: 'Create a new artifact' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 201, description: 'Artifact created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifact set not found' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: CreateArtifactDto,
  ) {
    return this.userArtifactsService.create(user.userId, accountId, dto);
  }

  @ApiOperation({ summary: 'Update an artifact' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'artifactId', description: 'Artifact ID' })
  @ApiResponse({ status: 200, description: 'Artifact updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account, artifact, or artifact set not found' })
  @Patch(':artifactId')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('artifactId') artifactId: string,
    @Body() dto: UpdateArtifactDto,
  ) {
    return this.userArtifactsService.update(user.userId, accountId, artifactId, dto);
  }

  @ApiOperation({ summary: 'Delete an artifact' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'artifactId', description: 'Artifact ID' })
  @ApiResponse({ status: 200, description: 'Artifact deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or artifact not found' })
  @Delete(':artifactId')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.userArtifactsService.remove(user.userId, accountId, artifactId);
  }
}
