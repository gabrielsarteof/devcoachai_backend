import { z } from 'zod';
import { LeaderboardType, LeaderboardScope, LeaderboardPeriod } from '../enums/leaderboard.enum';

export const LeaderboardKeySchema = z.object({
  type: z.nativeEnum(LeaderboardType),
  scope: z.nativeEnum(LeaderboardScope),
  scopeId: z.string().optional(),
  period: z.nativeEnum(LeaderboardPeriod),
  periodValue: z.string().optional(), 
});

export type LeaderboardKeyProps = z.infer<typeof LeaderboardKeySchema>;

export class LeaderboardKeyVO {
  private constructor(private readonly props: LeaderboardKeyProps) {}

  static create(data: LeaderboardKeyProps): LeaderboardKeyVO {
    const validated = LeaderboardKeySchema.parse(data);
    return new LeaderboardKeyVO(validated);
  }

  static fromString(key: string): LeaderboardKeyVO {
    const parts = key.replace('lb:', '').split(':');
    
    return new LeaderboardKeyVO({
      type: parts[0] as LeaderboardType,
      scope: parts[1] as LeaderboardScope,
      scopeId: parts[2] !== 'global' ? parts[2] : undefined,
      period: parts[3] as LeaderboardPeriod,
      periodValue: parts[4],
    });
  }

  toCacheKey(): string {
    const { type, scope, scopeId, period, periodValue } = this.props;
    const scopeKey = scopeId || 'global';
    const periodKey = periodValue || 'current';
    
    return `lb:${type}:${scope}:${scopeKey}:${period}:${periodKey}`;
  }

  getProps(): LeaderboardKeyProps {
    return { ...this.props };
  }

  getPeriodDisplay(): string {
    const { period, periodValue } = this.props;
    
    switch (period) {
      case LeaderboardPeriod.WEEKLY:
        return periodValue ? `Semana ${periodValue}` : 'Esta Semana';
      case LeaderboardPeriod.MONTHLY:
        return periodValue ? `${periodValue}` : 'Este Mês';
      case LeaderboardPeriod.DAILY:
        return periodValue ? periodValue : 'Hoje';
      default:
        return 'Todos os Tempos';
    }
  }
}