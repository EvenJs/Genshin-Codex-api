import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AchievementsService } from './achievements.service';
import { ListAchievementsQueryDto } from './dto/list-achievements.query.dto';

@ApiTags('Achievements')
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @ApiOperation({ summary: 'List achievements with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'region', required: false, type: String })
  @ApiQuery({ name: 'isHidden', required: false, type: Boolean })
  @ApiQuery({ name: 'version', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search in name/description' })
  @ApiResponse({ status: 200, description: 'Paginated list of achievements' })
  @Get()
  list(@Query() query: ListAchievementsQueryDto) {
    return this.achievementsService.list(query);
  }

  @ApiOperation({ summary: 'Get achievement by ID' })
  @ApiResponse({ status: 200, description: 'Achievement details' })
  @ApiResponse({ status: 404, description: 'Achievement not found' })
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.achievementsService.getById(id);
  }
}
