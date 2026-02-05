import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiFeedbackDto } from './dto/ai-feedback.dto';

@Injectable()
export class AiFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(userId: string, dto: AiFeedbackDto) {
    const result = await this.prisma.aiResult.findUnique({
      where: { id: dto.aiResultId },
      select: { userId: true },
    });

    if (!result || result.userId !== userId) {
      throw new NotFoundException('AI result not found');
    }

    return this.prisma.aiFeedback.upsert({
      where: { aiResultId: dto.aiResultId },
      create: {
        aiResultId: dto.aiResultId,
        userId,
        rating: dto.rating,
        helpful: dto.helpful,
        comment: dto.comment?.trim() || null,
      },
      update: {
        rating: dto.rating,
        helpful: dto.helpful,
        comment: dto.comment?.trim() || null,
      },
    });
  }
}
