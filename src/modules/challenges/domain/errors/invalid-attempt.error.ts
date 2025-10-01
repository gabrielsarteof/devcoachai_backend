import { ChallengeError } from './challenge.error';

export class InvalidAttemptError extends ChallengeError {
  readonly code = 'CHALLENGE_INVALID_ATTEMPT';
  readonly statusCode = 403;

  constructor(message: string = 'Invalid attempt or unauthorized access') {
    super(message);
  }
}
