import { MetricError } from './metric.error';

export class AttemptNotFoundError extends MetricError {
  readonly code = 'METRIC_ATTEMPT_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message: string = 'Attempt not found') {
    super(message);
  }
}
