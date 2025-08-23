import { z } from 'zod';
import { messages } from '@/shared/constants/messages';

export const RegisterSchema = z.object({
  email: z
    .string({ required_error: messages.validation.required })
    .email(messages.validation.email)
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: messages.validation.required })
    .min(8, messages.validation.passwordTooShort)
    .regex(/[A-Z]/, messages.validation.passwordUppercase)
    .regex(/[a-z]/, messages.validation.passwordLowercase)
    .regex(/[0-9]/, messages.validation.passwordNumber)
    .regex(/[^A-Za-z0-9]/, messages.validation.passwordSpecial),
  name: z
    .string({ required_error: messages.validation.required })
    .min(2, messages.validation.nameTooShort)
    .max(100, messages.validation.nameTooLong)
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
    .string({ required_error: messages.validation.required })
    .email(messages.validation.email)
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: messages.validation.required }),
});

export type LoginDTO = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }),
});

export type RefreshTokenDTO = z.infer<typeof RefreshTokenSchema>;