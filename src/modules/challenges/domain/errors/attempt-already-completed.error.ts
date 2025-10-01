import { ChallengeError } from './challenge.error';

export class AttemptAlreadyCompletedError extends ChallengeError {
  readonly code = 'CHALLENGE_ATTEMPT_COMPLETED';
  readonly statusCode = 400;

  constructor(message: string = 'Attempt already completed') {
    super(message);
  }
}
