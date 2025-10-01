import { ChallengeError } from './challenge.error';
import { ZodError, ZodIssue } from 'zod';

interface ValidationDetail {
  field: string;
  code: string;
  message: string;
}

export class ValidationError extends ChallengeError {
  readonly code = 'CHALLENGE_VALIDATION_FAILED';
  readonly statusCode = 400;
  readonly details: ValidationDetail[];

  constructor(zodError: ZodError) {
    super('Validation failed');
    this.details = zodError.issues.map((issue: ZodIssue) => ({
      field: issue.path.join('.'),
      code: issue.code,
      message: issue.message
    }));
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}
