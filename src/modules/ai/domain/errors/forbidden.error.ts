import { AIError } from './ai.error';

export class ForbiddenError extends AIError {
  readonly code = 'AI_FORBIDDEN';
  readonly statusCode = 403;

  constructor(message: string = 'Access forbidden') {
    super(message);
  }
}
