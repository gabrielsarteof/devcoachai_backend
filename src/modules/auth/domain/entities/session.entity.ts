export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

export class SessionEntity {
  constructor(private readonly props: Session) {}

  static create(data: {
    userId: string;
    refreshToken: string;
    userAgent?: string;
    ipAddress?: string;
  }): SessionEntity {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return new SessionEntity({
      id: crypto.randomUUID(),
      userId: data.userId,
      refreshToken: data.refreshToken,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      createdAt: now,
      expiresAt,
      lastActivity: now,
    });
  }

  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  updateActivity(): void {
    this.props.lastActivity = new Date();
  }

  getProps(): Session {
    return this.props;
  }
}