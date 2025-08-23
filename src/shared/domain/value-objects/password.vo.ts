import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { messages } from '@/shared/constants/messages';

export const PasswordSchema = z
  .string({ required_error: messages.validation.required })
  .min(8, messages.validation.passwordTooShort)
  .max(100, messages.validation.passwordTooLong)
  .regex(/[A-Z]/, messages.validation.passwordUppercase)
  .regex(/[a-z]/, messages.validation.passwordLowercase)
  .regex(/[0-9]/, messages.validation.passwordNumber)
  .regex(/[^A-Za-z0-9]/, messages.validation.passwordSpecial);

export class Password {
  private constructor(private readonly hashedValue: string) {}

  static async create(plainPassword: string): Promise<Password> {
    const validated = PasswordSchema.parse(plainPassword);
    const hashed = await bcrypt.hash(validated, 12);
    return new Password(hashed);
  }

  static fromHash(hashedPassword: string): Password {
    return new Password(hashedPassword);
  }

  async compare(plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, this.hashedValue);
  }

  getHash(): string {
    return this.hashedValue;
  }
}