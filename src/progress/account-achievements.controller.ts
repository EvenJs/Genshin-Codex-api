import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { ListAccountAchievementsQueryDto } from './dto/list-account-achievements.query.dto';
import { ProgressService } from './progress.service';

@ApiTags('Account Achievements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/achievements')
export class AccountAchievementsController {
  constructor(private progressService: ProgressService) {}

  @ApiOperation({ summary: 'List achievements with completion status for an account' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 200, description: 'Paginated achievements with progress' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Query() query: ListAccountAchievementsQueryDto,
  ) {
    return this.progressService.listWithProgress(user.userId, accountId, query);
  }
}
