import { GamificationError } from './gamification.error';

export class NotificationAlreadyAcknowledgedError extends GamificationError {
  readonly code = 'GAMIFICATION_NOTIFICATION_ALREADY_ACKNOWLEDGED';
  readonly statusCode = 409;

  constructor(message: string = 'Notification already acknowledged') {
    super(message);
  }
}