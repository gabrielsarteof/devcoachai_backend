import { MetricError } from './metric.error';

export class InvalidAttemptError extends MetricError {
  readonly code = 'METRIC_INVALID_ATTEMPT';
  readonly statusCode = 403;

  constructor(message: string = 'Invalid attempt or unauthorized') {
    super(message);
  }
}
