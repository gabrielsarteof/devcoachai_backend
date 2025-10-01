import { AuthError } from './auth.error';

export class EmailAlreadyExistsError extends AuthError {
  readonly code = 'AUTH_EMAIL_ALREADY_EXISTS';
  readonly statusCode = 400;

  constructor(message: string = 'Email already exists') {
    super(message);
  }
}
