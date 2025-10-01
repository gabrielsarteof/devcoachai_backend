import { ChallengeError } from './challenge.error';

export class LanguageNotSupportedError extends ChallengeError {
  readonly code = 'CHALLENGE_LANGUAGE_NOT_SUPPORTED';
  readonly statusCode = 400;

  constructor(language: string) {
    super(`Language ${language} not supported for this challenge`);
  }
}
