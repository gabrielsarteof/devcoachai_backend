import { z } from 'zod';
import { UserRole } from '@/shared/domain/enums';

export const UpdateUserSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    avatarUrl: z.string().url().optional(),
    role: z.nativeEnum(UserRole).optional(),
    position: z.string().optional(),
    yearsOfExperience: z.number().int().min(0).max(50).optional(),
    preferredLanguages: z.array(z.string()).optional(),
    githubUsername: z.string().optional(),
    teamId: z.string().cuid().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
