import { AIError } from './ai.error';

export class NotImplementedError extends AIError {
  readonly code = 'AI_NOT_IMPLEMENTED';
  readonly statusCode = 501;

  constructor(message: string = 'Feature not implemented') {
    super(message);
  }
}
