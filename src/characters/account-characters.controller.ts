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
import { AccountCharactersService } from './account-characters.service';
import { EquipArtifactsDto } from './dto/equip-artifacts.dto';

@ApiTags('Account Characters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts/:accountId/characters')
export class AccountCharactersController {
  constructor(private readonly accountCharactersService: AccountCharactersService) {}

  @ApiOperation({ summary: 'List all characters for an account' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiResponse({ status: 200, description: 'List of account characters with equipped artifacts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('accountId') accountId: string) {
    return this.accountCharactersService.findAll(user.userId, accountId);
  }

  @ApiOperation({ summary: 'Get account character by ID' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Account character ID' })
  @ApiResponse({ status: 200, description: 'Account character details with equipped artifacts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account or character not found' })
  @Get(':characterId')
  findById(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
  ) {
    return this.accountCharactersService.findById(user.userId, accountId, characterId);
  }

  @ApiOperation({ summary: 'Equip artifacts to a character' })
  @ApiParam({ name: 'accountId', description: 'Game account ID' })
  @ApiParam({ name: 'characterId', description: 'Account character ID' })
  @ApiResponse({ status: 200, description: 'Artifacts equipped successfully' })
  @ApiResponse({ status: 400, description: 'Validation error (wrong artifact slot type)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Account belongs to another user' })
  @ApiResponse({ status: 404, description: 'Account, character, or artifact not found' })
  @Put(':characterId/artifacts')
  equipArtifacts(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @Body() dto: EquipArtifactsDto,
  ) {
    return this.accountCharactersService.equipArtifacts(user.userId, accountId, characterId, dto);
  }
}
