import { GamificationError } from './gamification.error';

export class NotificationNotFoundError extends GamificationError {
  readonly code = 'GAMIFICATION_NOTIFICATION_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Notification not found') {
    super(message);
  }
}