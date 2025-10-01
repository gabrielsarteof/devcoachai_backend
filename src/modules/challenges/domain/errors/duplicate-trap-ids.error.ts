import { ChallengeError } from './challenge.error';

export class DuplicateTrapIdsError extends ChallengeError {
  readonly code = 'CHALLENGE_DUPLICATE_TRAP_IDS';
  readonly statusCode = 400;

  constructor(message: string = 'Trap IDs must be unique') {
    super(message);
  }
}
