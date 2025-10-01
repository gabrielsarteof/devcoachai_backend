import { ChallengeError } from './challenge.error';

export class ChallengeSlugExistsError extends ChallengeError {
  readonly code = 'CHALLENGE_SLUG_EXISTS';
  readonly statusCode = 409;

  constructor(slug: string) {
    super(`Challenge with slug '${slug}' already exists`);
  }
}
