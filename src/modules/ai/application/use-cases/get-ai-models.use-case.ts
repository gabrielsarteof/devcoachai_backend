import { ProviderFactoryService } from '../../infrastructure/services/provider-factory.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class GetAIModelsUseCase {
  constructor(
    private readonly providerFactory: ProviderFactoryService
  ) {}

  async execute() {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    logger.debug({
      requestId,
      operation: 'get_ai_models',
    }, 'Retrieving available AI models');

    try {
      const providers = this.providerFactory.getAvailableProviders();
      const models: Record<string, any> = {};

      for (const providerName of providers) {
        try {
          const provider = this.providerFactory.create(providerName);
          models[providerName] = {
            models: provider.models.map(model => ({
              id: model.id,
              name: model.name,
              contextWindow: model.contextWindow,
              inputCost: model.inputCost,
              outputCost: model.outputCost,
              capabilities: model.capabilities,
            })),
            available: true,
          };
        } catch (error) {
          logger.warn({
            requestId,
            provider: providerName,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, `Provider ${providerName} not available`);

          models[providerName] = {
            models: [],
            available: false,
            error: 'Provider not configured',
          };
        }
      }

      const executionTime = Date.now() - startTime;

      logger.info({
        requestId,
        providersCount: providers.length,
        availableProviders: Object.values(models).filter((p: any) => p.available).length,
        executionTime,
      }, 'AI models retrieved successfully');

      return { models };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error({
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
      }, 'Failed to get AI models');

      throw error;
    }
  }
}