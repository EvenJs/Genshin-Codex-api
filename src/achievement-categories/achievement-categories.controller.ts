import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AchievementCategoriesService } from './achievement-categories.service';
import { ListCategoriesQueryDto } from './dto/list-categories.query.dto';

@ApiTags('Achievement Categories')
@Controller('achievement-categories')
export class AchievementCategoriesController {
  constructor(private readonly service: AchievementCategoriesService) {}

  @ApiOperation({ summary: 'List all achievement categories' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 50 })
  @ApiQuery({
    name: 'includeCount',
    required: false,
    type: Boolean,
    example: true,
  })
  @ApiResponse({ status: 200, description: 'List of achievement categories' })
  @Get()
  list(@Query() query: ListCategoriesQueryDto) {
    return this.service.list(query);
  }

  @ApiOperation({ summary: 'Get achievement category by ID' })
  @ApiResponse({ status: 200, description: 'Achievement category details' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
