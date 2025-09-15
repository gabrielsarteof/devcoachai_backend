import { z } from 'zod';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export const NotificationPropsSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  type: z.enum(['achievement', 'reminder', 'milestone', 'level_up', 'badge_unlock', 'streak_risk']),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  icon: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  category: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['button', 'link']),
    action: z.string(),
    style: z.enum(['primary', 'secondary', 'danger']),
  })).optional(),
  expiresAt: z.date().optional(),
  readAt: z.date().optional(),
  createdAt: z.date(),
});

export type NotificationProps = z.infer<typeof NotificationPropsSchema>;

export class NotificationEntity {
  private constructor(private readonly props: NotificationProps) {}

  static create(data: Omit<NotificationProps, 'id' | 'createdAt'>): NotificationEntity {
    const props: NotificationProps = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
    };

    const validated = NotificationPropsSchema.parse(props);
    logger.info({ operation: 'notification_entity_created', notificationId: validated.id, userId: validated.userId }, 'Notification entity created');
    return new NotificationEntity(validated);
  }

  static fromPersistence(data: any): NotificationEntity {
    const validated = NotificationPropsSchema.parse(data);
    return new NotificationEntity(validated);
  }

  markAsRead(): void {
    if (this.props.readAt) return;
    this.props.readAt = new Date();
    logger.info({ notificationId: this.props.id, userId: this.props.userId }, 'Notification marked as read');
  }

  isExpired(): boolean {
    return this.props.expiresAt ? new Date() > this.props.expiresAt : false;
  }

  isRead(): boolean {
    return !!this.props.readAt;
  }

  shouldShow(): boolean {
    return !this.isExpired() && !this.isRead();
  }

  getId(): string { return this.props.id; }
  getUserId(): string { return this.props.userId; }
  getType(): NotificationProps['type'] { return this.props.type; }
  getPriority(): NotificationProps['priority'] { return this.props.priority; }
  
  toJSON(): NotificationProps { return { ...this.props }; }

  toPrismaCreate(): any {
    return {
      id: this.props.id,
      userId: this.props.userId,
      type: this.props.type,
      title: this.props.title,
      message: this.props.message,
      icon: this.props.icon,
      priority: this.props.priority,
      category: this.props.category,
      metadata: this.props.metadata || {},
      actions: this.props.actions || [],
      expiresAt: this.props.expiresAt,
      readAt: this.props.readAt,
      createdAt: this.props.createdAt,
    };
  }
}