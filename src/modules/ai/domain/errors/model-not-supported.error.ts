import { AIError } from './ai.error';

export class ModelNotSupportedError extends AIError {
  readonly code = 'AI_MODEL_NOT_SUPPORTED';
  readonly statusCode = 400;

  constructor(provider: string, model: string) {
    super(`Model ${model} not supported by ${provider}`);
  }
}
