import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate that the account exists and belongs to the current user.
   * @throws NotFoundException if account does not exist
   * @throws ForbiddenException if account belongs to another user
   * @returns GameAccount if validation passes
   */
  async validateOwnership(currentUserId: string, accountId: string) {
    const account = await this.prisma.gameAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    if (account.userId !== currentUserId) {
      throw new ForbiddenException('You do not own this account');
    }

    return account;
  }

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

  async remove(userId: string, accountId: string) {
    await this.validateOwnership(userId, accountId);

    await this.prisma.gameAccount.delete({
      where: { id: accountId },
    });

    return { ok: true };
  }
}
