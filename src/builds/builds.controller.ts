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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { BuildsService } from './builds.service';
import {
  CreateBuildDto,
  ListBuildsQueryDto,
  ListMyBuildsQueryDto,
  SaveBuildDto,
  UpdateBuildDto,
} from './dto';

@ApiTags('Builds')
@Controller()
export class BuildsController {
  constructor(private readonly buildsService: BuildsService) {}

  // ==================== Public Endpoints ====================

  @ApiOperation({ summary: 'Get public builds (optionally filtered by character)' })
  @ApiQuery({ name: 'characterId', required: false, description: 'Filter by character ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of public builds' })
  @Get('builds')
  findPublicBuilds(@Query() query: ListBuildsQueryDto) {
    return this.buildsService.findPublicBuilds(query);
  }

  @ApiOperation({ summary: 'Get a single build by ID' })
  @ApiParam({ name: 'id', description: 'Build ID' })
  @ApiResponse({ status: 200, description: 'Build details' })
  @ApiResponse({ status: 403, description: 'Build is private and not owned by user' })
  @ApiResponse({ status: 404, description: 'Build not found' })
  @Get('builds/:id')
  findBuildById(@Param('id') id: string) {
    return this.buildsService.findById(id);
  }

  // ==================== User's Own Builds ====================

  @ApiOperation({ summary: "Get current user's created builds" })
  @ApiBearerAuth()
  @ApiQuery({ name: 'characterId', required: false, description: 'Filter by character ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: "Paginated list of user's builds" })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('users/me/builds')
  findMyBuilds(@CurrentUser() user: JwtPayload, @Query() query: ListMyBuildsQueryDto) {
    return this.buildsService.findMyBuilds(user.userId, query);
  }

  @ApiOperation({ summary: 'Create a new build' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Build created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Character or artifact set not found' })
  @UseGuards(JwtAuthGuard)
  @Post('users/me/builds')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBuildDto) {
    return this.buildsService.create(user.userId, dto);
  }

  @ApiOperation({ summary: 'Update a build' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Build ID' })
  @ApiResponse({ status: 200, description: 'Build updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this build' })
  @ApiResponse({ status: 404, description: 'Build, character, or artifact set not found' })
  @UseGuards(JwtAuthGuard)
  @Patch('users/me/builds/:id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBuildDto,
  ) {
    return this.buildsService.update(user.userId, id, dto);
  }

  @ApiOperation({ summary: 'Delete a build' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Build ID' })
  @ApiResponse({ status: 200, description: 'Build deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this build' })
  @ApiResponse({ status: 404, description: 'Build not found' })
  @UseGuards(JwtAuthGuard)
  @Delete('users/me/builds/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.buildsService.remove(user.userId, id);
  }

  // ==================== Saved Builds ====================

  @ApiOperation({ summary: "Get current user's saved builds" })
  @ApiBearerAuth()
  @ApiQuery({ name: 'characterId', required: false, description: 'Filter by character ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: "Paginated list of user's saved builds" })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('users/me/saved-builds')
  findSavedBuilds(@CurrentUser() user: JwtPayload, @Query() query: ListMyBuildsQueryDto) {
    return this.buildsService.findSavedBuilds(user.userId, query);
  }

  @ApiOperation({ summary: 'Save a public build to collection' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Build saved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Build is private' })
  @ApiResponse({ status: 404, description: 'Build not found' })
  @ApiResponse({ status: 409, description: 'Build already saved' })
  @UseGuards(JwtAuthGuard)
  @Post('users/me/saved-builds')
  saveBuild(@CurrentUser() user: JwtPayload, @Body() dto: SaveBuildDto) {
    return this.buildsService.saveBuild(user.userId, dto);
  }

  @ApiOperation({ summary: 'Remove a saved build from collection' })
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Saved build ID' })
  @ApiResponse({ status: 200, description: 'Saved build removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Saved build not found' })
  @UseGuards(JwtAuthGuard)
  @Delete('users/me/saved-builds/:id')
  unsaveBuild(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.buildsService.unsaveBuild(user.userId, id);
  }
}
