import { AuthError } from './auth.error';

export class SessionNotFoundError extends AuthError {
  readonly code = 'AUTH_SESSION_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Session not found') {
    super(message);
  }
}
