import { AuthError } from './auth.error';

export class UnauthorizedError extends AuthError {
  readonly code = 'AUTH_UNAUTHORIZED';
  readonly statusCode = 401;

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}
