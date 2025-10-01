import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z
    .string()
    .email()
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z
    .string()
    .min(2)
    .max(100)
    .trim(),
  companyId: z.string().cuid().optional(),
  acceptTerms: z
    .boolean()
    .refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
});

export type RegisterDTO = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z
    .string()
    .email()
    .toLowerCase()
    .trim(),
  password: z.string(),
});

export type LoginDTO = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshTokenDTO = z.infer<typeof RefreshTokenSchema>;