import { z } from 'zod';

export const LeaderboardEntrySchema = z.object({
  userId: z.string().cuid(),
  displayName: z.string(),
  score: z.number(),
  position: z.number().int().positive(),
  change: z.number().int().optional(),
  avatar: z.string().url().optional(),
  level: z.number().int().positive(),
  isAnonymous: z.boolean().default(false),
  lastActivity: z.date().optional(),
});

export type LeaderboardEntryProps = z.infer<typeof LeaderboardEntrySchema>;

export class LeaderboardEntryEntity {
  private constructor(private readonly props: LeaderboardEntryProps) {}

  static create(data: LeaderboardEntryProps): LeaderboardEntryEntity {
    const validated = LeaderboardEntrySchema.parse(data);
    return new LeaderboardEntryEntity(validated);
  }

  static fromPrismaUser(user: any, score: number, position: number): LeaderboardEntryEntity {
    return new LeaderboardEntryEntity({
      userId: user.id,
      displayName: user.name,
      score,
      position,
      avatar: user.avatarUrl,
      level: user.currentLevel,
      isAnonymous: false,
      lastActivity: user.lastLoginAt,
    });
  }

  anonymize(): LeaderboardEntryEntity {
    return new LeaderboardEntryEntity({
      ...this.props,
      displayName: `Usuário #${this.props.position}`,
      avatar: undefined,
      isAnonymous: true,
    });
  }

  getUserId(): string {
    return this.props.userId;
  }

  getPosition(): number {
    return this.props.position;
  }

  getScore(): number {
    return this.props.score;
  }

  toCacheData(): {
    userId: string;
    name: string;
    avatarUrl: string | null;
    score: number;
    position: number;
    metadata: Record<string, unknown>;
  } {
    return {
      userId: this.props.userId,
      name: this.props.displayName,
      avatarUrl: this.props.avatar || null,
      score: this.props.score,
      position: this.props.position,
      metadata: {
        level: this.props.level,
        isAnonymous: this.props.isAnonymous,
        lastActivity: this.props.lastActivity?.toISOString(),
        change: this.props.change,
      },
    };
  }

  static fromCacheData(data: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    score: number;
    position: number;
    metadata: Record<string, unknown>;
  }): LeaderboardEntryEntity {
    const metadata = data.metadata || {};

    return new LeaderboardEntryEntity({
      userId: data.userId,
      displayName: data.name,
      score: data.score,
      position: data.position,
      avatar: data.avatarUrl || undefined,
      level: (metadata.level as number) || 1,
      isAnonymous: (metadata.isAnonymous as boolean) || false,
      lastActivity: metadata.lastActivity ? new Date(metadata.lastActivity as string) : undefined,
      change: metadata.change as number | undefined,
    });
  }

  toJSON(): LeaderboardEntryProps {
    return { ...this.props };
  }
}