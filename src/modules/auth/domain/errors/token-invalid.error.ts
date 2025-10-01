import { AuthError } from './auth.error';

export class TokenInvalidError extends AuthError {
  readonly code = 'AUTH_TOKEN_INVALID';
  readonly statusCode = 401;

  constructor(message: string = 'Invalid token') {
    super(message);
  }
}
