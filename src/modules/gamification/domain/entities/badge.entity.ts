import { Badge as PrismaBadge, Rarity } from '@prisma/client';
import { BadgeCategory } from '../enums/badge-category.enum';
import { BadgeRequirementVO, BadgeRequirement } from '../value-objects/badge-requirement.vo';
import { z } from 'zod';

export const BadgePropsSchema = z.object({
  id: z.string().cuid(),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string(),
  rarity: z.nativeEnum(Rarity),
  category: z.nativeEnum(BadgeCategory),
  requirement: z.any().refine((val) => val instanceof BadgeRequirementVO, {
    message: "Must be a BadgeRequirementVO instance"
  }),
  xpReward: z.number().int().min(0),
  visible: z.boolean(),
  unlockedAt: z.date().optional(),
  progress: z.number().min(0).max(100).optional(),
});

export type BadgeProps = z.infer<typeof BadgePropsSchema>;

export class BadgeEntity {
  private constructor(private readonly props: BadgeProps) {}

  static create(data: Omit<BadgeProps, 'id'> & { requirement: BadgeRequirement }): BadgeEntity {
    const requirement = BadgeRequirementVO.create(data.requirement);
    
    const props: BadgeProps = {
      id: crypto.randomUUID(),
      ...data,
      requirement,
    };

    return new BadgeEntity(props);
  }

  static fromPrisma(badge: PrismaBadge, userBadge?: { unlockedAt: Date; progress: number }): BadgeEntity {
    const requirement = BadgeRequirementVO.fromPrismaJson(badge.requirements);
    
    const props: BadgeProps = {
      id: badge.id,
      key: badge.key,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      rarity: badge.rarity,
      category: BadgeCategory.MILESTONE,
      requirement,
      xpReward: badge.xpReward,
      visible: badge.visible,
      unlockedAt: userBadge?.unlockedAt,
      progress: userBadge?.progress,
    };

    return new BadgeEntity(props);
  }

  getId(): string {
    return this.props.id;
  }

  getKey(): string {
    return this.props.key;
  }

  getName(): string {
    return this.props.name;
  }

  getRequirement(): BadgeRequirementVO {
    return this.props.requirement;
  }

  getXPReward(): number {
    return this.props.xpReward;
  }

  isUnlocked(): boolean {
    return !!this.props.unlockedAt;
  }

  getProgress(): number {
    return this.props.progress || 0;
  }

  toJSON(): BadgeProps {
    return { ...this.props };
  }

  toPrismaCreate(): Omit<PrismaBadge, 'id'> {
    return {
      key: this.props.key,
      name: this.props.name,
      description: this.props.description,
      icon: this.props.icon,
      rarity: this.props.rarity,
      requirements: this.props.requirement.toPrismaJson(),
      xpReward: this.props.xpReward,
      visible: this.props.visible,
    };
  }
}