import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArtifactSetsService } from './artifact-sets.service';

@ApiTags('Artifact Sets')
@Controller('artifact-sets')
export class ArtifactSetsController {
  constructor(private readonly artifactSetsService: ArtifactSetsService) {}

  @ApiOperation({ summary: 'List all artifact sets' })
  @ApiResponse({ status: 200, description: 'List of all artifact sets' })
  @Get()
  findAll() {
    return this.artifactSetsService.findAll();
  }

  @ApiOperation({ summary: 'Get artifact set by ID' })
  @ApiResponse({ status: 200, description: 'Artifact set details' })
  @ApiResponse({ status: 404, description: 'Artifact set not found' })
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.artifactSetsService.findById(id);
  }
}
