import { AuthError } from './auth.error';

export class UserNotFoundError extends AuthError {
  readonly code = 'AUTH_USER_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'User not found') {
    super(message);
  }
}
