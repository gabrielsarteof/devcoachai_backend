import { MetricError } from './metric.error';

export class InvalidMetricsDataError extends MetricError {
  readonly code = 'METRIC_INVALID_DATA';
  readonly statusCode = 400;

  constructor(message: string = 'Invalid metrics data') {
    super(message);
  }
}
