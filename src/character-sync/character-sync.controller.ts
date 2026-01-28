import { Controller, Post, Param, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterSyncService, SyncResult } from './character-sync.service';

@ApiTags('Admin - Character Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/characters/sync')
export class CharacterSyncController {
  constructor(private readonly syncService: CharacterSyncService) {}

  @ApiOperation({ summary: 'Sync all characters from external API' })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        synced: { type: 'number' },
        failed: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Post()
  async syncAll(): Promise<SyncResult> {
    return this.syncService.syncAllCharacters();
  }

  @ApiOperation({ summary: 'Sync single character from external API' })
  @ApiResponse({
    status: 200,
    description: 'Character synced',
  })
  @Post(':id')
  async syncOne(@Param('id') id: string) {
    return this.syncService.syncCharacter(id);
  }

  @ApiOperation({ summary: 'Get last sync status' })
  @ApiResponse({
    status: 200,
    description: 'Last sync status',
  })
  @Get('status')
  async getStatus() {
    return this.syncService.getLastSyncStatus();
  }
}
