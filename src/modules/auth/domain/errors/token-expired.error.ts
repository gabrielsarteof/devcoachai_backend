import { AuthError } from './auth.error';

export class TokenExpiredError extends AuthError {
  readonly code = 'AUTH_TOKEN_EXPIRED';
  readonly statusCode = 401;

  constructor(message: string = 'Token has expired') {
    super(message);
  }
}
