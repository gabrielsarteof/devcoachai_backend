import { z } from 'zod';
import { JsonValue } from '@prisma/client/runtime/library';

export const BadgeRequirementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('xp'),
    threshold: z.number().positive(),
  }),
  z.object({
    type: z.literal('level'),
    threshold: z.number().int().min(1).max(10),
  }),
  z.object({
    type: z.literal('challenges'),
    challengeCount: z.number().int().positive(),
    category: z.enum(['BACKEND', 'FRONTEND', 'FULLSTACK', 'DEVOPS', 'MOBILE', 'DATA']).optional(),
  }),
  z.object({
    type: z.literal('streak'),
    streakDays: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('metrics'),
    metricType: z.enum(['DI', 'PR', 'CS']),
    threshold: z.number().min(0).max(100),
    comparison: z.enum(['gte', 'lte', 'eq']).default('gte'),
  }),
  z.object({
    type: z.literal('special'),
    customCondition: z.string(),
  }),
]);

export type BadgeRequirement = z.infer<typeof BadgeRequirementSchema>;

export class BadgeRequirementVO {
  private constructor(private readonly value: BadgeRequirement) {}

  static create(data: unknown): BadgeRequirementVO {
    const validated = BadgeRequirementSchema.parse(data);
    return new BadgeRequirementVO(validated);
  }

  static fromPrismaJson(json: unknown): BadgeRequirementVO {
    return BadgeRequirementVO.create(json);
  }

  getValue(): BadgeRequirement {
    return this.value;
  }

  getType(): BadgeRequirement['type'] {
    return this.value.type;
  }

  toPrismaJson(): JsonValue {
    return this.value as JsonValue;
  }
}