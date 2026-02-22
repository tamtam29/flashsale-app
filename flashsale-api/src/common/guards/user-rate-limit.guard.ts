import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface RequestWithUser {
  body?: { userId?: string };
  params?: { userId?: string };
  query?: { userId?: string };
  ip?: string;
}

@Injectable()
export class UserRateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: RequestWithUser): Promise<string> {
    // Extract userId from request body or params
    const userId = req.body?.userId || req.params?.userId || req.query?.userId;

    // If userId exists, use it for rate limiting, otherwise fall back to IP
    return Promise.resolve(userId || req.ip || 'unknown');
  }
}
