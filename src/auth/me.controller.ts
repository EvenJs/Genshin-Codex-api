import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './jwt.strategy';

@ApiTags('User')
@Controller()
export class MeController {
  @ApiOperation({ summary: 'Get current user info' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.userId, email: user.email };
  }
}
