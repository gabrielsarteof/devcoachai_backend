import { ChallengeError } from './challenge.error';

export class InvalidTestCaseWeightsError extends ChallengeError {
  readonly code = 'CHALLENGE_INVALID_WEIGHTS';
  readonly statusCode = 400;

  constructor(message: string = 'Test case weights must sum to 1.0') {
    super(message);
  }
}
