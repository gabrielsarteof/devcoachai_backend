import { AIError } from './ai.error';

export class ProviderError extends AIError {
  readonly code = 'AI_PROVIDER_ERROR';
  readonly statusCode = 500;

  constructor(message: string = 'Provider not available') {
    super(message);
  }
}
