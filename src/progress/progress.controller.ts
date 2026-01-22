import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ProgressService } from './progress.service';

@ApiTags('Progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/progress')
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @ApiOperation({ summary: 'Get completed achievement IDs for an account' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 200, description: 'List of completed achievement IDs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @Get()
  getProgress(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.progressService.getCompletedIds(user.userId, accountId);
  }

  @ApiOperation({ summary: 'Update achievement completion status' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'achievementId', description: 'Achievement ID' })
  @ApiResponse({ status: 200, description: 'Progress updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or achievement not found' })
  @Put(':achievementId')
  updateProgress(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('achievementId') achievementId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.updateProgress(
      user.userId,
      accountId,
      achievementId,
      dto.completed,
    );
  }
}
