import { MetricError } from './metric.error';

export class MetricsDataInconsistentError extends MetricError {
  readonly code = 'METRIC_DATA_INCONSISTENT';
  readonly statusCode = 400;

  constructor(message: string = 'Metrics data inconsistent') {
    super(message);
  }
}
