import { IUsageQuotaService, UserQuota } from '../../domain/services/usage-quota.service.interface';
import { UsageTrackerService } from './usage-tracker.service';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class UsageQuotaService implements IUsageQuotaService {
  constructor(
    private readonly usageTracker: UsageTrackerService
  ) {}

  async getUserQuota(userId: string): Promise<UserQuota> {
    try {
      const usage = await this.usageTracker.getUsage(userId);

      // Limites padrão baseados no nível do usuário (implementar lógica específica se necessário)
      const dailyLimit = 10000;
      const monthlyLimit = 300000;

      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return {
        daily: {
          limit: dailyLimit,
          used: usage.tokens.daily,
          remaining: Math.max(0, dailyLimit - usage.tokens.daily),
        },
        monthly: {
          limit: monthlyLimit,
          used: usage.tokens.monthly,
          remaining: Math.max(0, monthlyLimit - usage.tokens.monthly),
        },
        resetAt: tomorrow,
      };
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to get user quota');
      throw error;
    }
  }

  async checkQuotaAvailable(userId: string, tokensNeeded: number): Promise<boolean> {
    try {
      const quota = await this.getUserQuota(userId);
      return quota.daily.remaining >= tokensNeeded && quota.monthly.remaining >= tokensNeeded;
    } catch (error) {
      logger.error({
        userId,
        tokensNeeded,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to check quota availability');
      throw error;
    }
  }

  async updateQuotaUsage(userId: string, tokensUsed: number): Promise<void> {
    try {
      await this.usageTracker.track(userId, {
        tokensUsed,
        requestsCount: 1,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error({
        userId,
        tokensUsed,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to update quota usage');
      throw error;
    }
  }
}