import { AIError } from './ai.error';

export class UnauthorizedError extends AIError {
  readonly code = 'AI_UNAUTHORIZED';
  readonly statusCode = 401;

  constructor(message: string = 'User not authenticated') {
    super(message);
  }
}
