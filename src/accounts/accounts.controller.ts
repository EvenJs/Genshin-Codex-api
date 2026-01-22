import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @ApiOperation({ summary: 'List all game accounts for current user' })
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.accountsService.findAll(user.userId);
  }

  @ApiOperation({ summary: 'Create a new game account' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(user.userId, dto);
  }

  @ApiOperation({ summary: 'Update game account nickname' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.userId, id, dto);
  }

  @ApiOperation({ summary: 'Delete a game account' })
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.accountsService.remove(user.userId, id);
  }
}
