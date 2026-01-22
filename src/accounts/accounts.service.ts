import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateAccountDto) {
    try {
      return await this.prisma.gameAccount.create({
        data: {
          userId,
          uid: dto.uid,
          server: dto.server,
          nickname: dto.nickname,
        },
        select: {
          id: true,
          uid: true,
          server: true,
          nickname: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Account with UID ${dto.uid} on server ${dto.server} already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    return this.prisma.gameAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        uid: true,
        server: true,
        nickname: true,
        createdAt: true,
      },
    });
  }
}
