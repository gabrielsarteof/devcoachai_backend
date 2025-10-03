import { AIError } from './ai.error';

export class InvalidProviderError extends AIError {
  readonly code = 'AI_INVALID_PROVIDER';
  readonly statusCode = 400;

  constructor(message: string = 'Invalid provider') {
    super(message);
  }
}
