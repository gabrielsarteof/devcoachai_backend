import { z } from 'zod';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

export const NotificationPropsSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: z.enum(['achievement', 'reminder', 'milestone', 'level_up', 'badge_unlock', 'streak_risk', 'maintenance']),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  icon: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  category: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['button', 'link']),
    action: z.string(),
    style: z.enum(['primary', 'secondary', 'danger']),
  })).nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  readAt: z.date().nullable().optional(),
  createdAt: z.date(),
});

export type NotificationProps = z.infer<typeof NotificationPropsSchema>;

export class NotificationEntity {
  private constructor(private readonly props: NotificationProps) {}

  static create(data: Omit<NotificationProps, 'id' | 'createdAt'>): NotificationEntity {
    const props: NotificationProps = {
      id: randomUUID(),
      ...data,
      createdAt: new Date(),
    };

    try {
      const validated = NotificationPropsSchema.parse(props);
      logger.info({ operation: 'notification_entity_created', notificationId: validated.id, userId: validated.userId }, 'Notification entity created');
      return new NotificationEntity(validated);
    } catch (error) {
      console.warn('=== NotificationEntity.create schema validation failed, using fallback ===', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      logger.info({ operation: 'notification_entity_created', notificationId: props.id, userId: props.userId }, 'Notification entity created (fallback)');
      return new NotificationEntity(props);
    }
  }

  static fromPersistence(data: any): NotificationEntity {
    const transformedData = {
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      readAt: data.readAt ? (data.readAt instanceof Date ? data.readAt : new Date(data.readAt)) : null,
      expiresAt: data.expiresAt ? (data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt)) : null,
      category: data.category || undefined,
      metadata: data.metadata || undefined,
      actions: data.actions || undefined,
    };

    try {
      const validated = NotificationPropsSchema.parse(transformedData);
      return new NotificationEntity(validated);
    } catch (error) {
      console.warn('Notification validation failed, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id: data.id
      });
      return new NotificationEntity(transformedData as NotificationProps);
    }
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
  
  toJSON(): NotificationProps & { acknowledged: boolean } {
    return {
      ...this.props,
      acknowledged: this.isRead()
    };
  }

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