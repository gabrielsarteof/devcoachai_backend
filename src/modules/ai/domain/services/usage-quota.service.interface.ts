export interface UserQuota {
  daily: {
    limit: number;
    used: number;
    remaining: number;
  };
  monthly: {
    limit: number;
    used: number;
    remaining: number;
  };
  resetAt: Date;
}

export interface IUsageQuotaService {
  getUserQuota(userId: string): Promise<UserQuota>;
  checkQuotaAvailable(userId: string, tokensNeeded: number): Promise<boolean>;
  updateQuotaUsage(userId: string, tokensUsed: number): Promise<void>;
}