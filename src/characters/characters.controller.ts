import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CharactersService } from './characters.service';

@ApiTags('Characters')
@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @ApiOperation({ summary: 'List all characters' })
  @ApiResponse({ status: 200, description: 'List of all characters' })
  @Get()
  findAll() {
    return this.charactersService.findAll();
  }

  @ApiOperation({ summary: 'Get character by ID' })
  @ApiResponse({ status: 200, description: 'Character details' })
  @ApiResponse({ status: 404, description: 'Character not found' })
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.charactersService.findById(id);
  }
}
