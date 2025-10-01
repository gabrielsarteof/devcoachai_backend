import { MetricError } from './metric.error';

export class UnauthorizedError extends MetricError {
  readonly code = 'METRIC_UNAUTHORIZED';
  readonly statusCode = 401;

  constructor(message: string = 'User not authenticated') {
    super(message);
  }
}
