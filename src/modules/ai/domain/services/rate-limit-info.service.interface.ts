export interface RateLimitInfo {
  requestsPerMinute: {
    limit: number;
    used: number;
    remaining: number;
  };
  requestsPerHour: {
    limit: number;
    used: number;
    remaining: number;
  };
  tokensPerDay: {
    limit: number;
    used: number;
    remaining: number;
  };
  resetTimes: {
    minute: Date;
    hour: Date;
    day: Date;
  };
}

export interface IRateLimitInfoService {
  getUserLimits(userId: string): Promise<RateLimitInfo>;
  getCurrentUsage(userId: string): Promise<{
    requests: number;
    tokens: number;
  }>;
}