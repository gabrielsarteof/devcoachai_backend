import { AIError } from './ai.error';

export class RateLimitExceededError extends AIError {
  readonly code = 'AI_RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly resetAt?: Date;

  constructor(message: string = 'Rate limit exceeded', resetAt?: Date) {
    super(message);
    this.resetAt = resetAt;
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      resetAt: this.resetAt?.toISOString(),
    };
  }
}
