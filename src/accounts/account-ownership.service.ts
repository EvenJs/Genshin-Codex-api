import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountOwnershipService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate that the account exists and belongs to the current user.
   * @throws NotFoundException if account does not exist
   * @throws ForbiddenException if account belongs to another user
   * @returns GameAccount if validation passes
   */
  async validate(currentUserId: string, accountId: string) {
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
}
