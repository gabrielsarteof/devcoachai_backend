import { z } from 'zod';
import { UserRole } from '@/shared/domain/enums';

export const CreateUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  avatarUrl: z.string().url().optional(),

  role: z.nativeEnum(UserRole).default(UserRole.JUNIOR),
  position: z.string().optional(),
  yearsOfExperience: z.number().int().min(0).max(50).default(0),
  preferredLanguages: z.array(z.string()).default([]),
  githubUsername: z.string().optional(),

  companyId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
});

export type CreateUserDTO = z.infer<typeof CreateUserSchema>;
