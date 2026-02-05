import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: any): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request?.headers?.authorization;
    if (!authHeader) {
      return true;
    }
    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err: unknown, user: any) {
    if (err) {
      throw err;
    }
    return user ?? null;
  }
}
