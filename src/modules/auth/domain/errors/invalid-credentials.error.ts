import { AuthError } from './auth.error';

export class InvalidCredentialsError extends AuthError {
  readonly code = 'AUTH_INVALID_CREDENTIALS';
  readonly statusCode = 401;

  constructor(message: string = 'Invalid credentials') {
    super(message);
  }
}
