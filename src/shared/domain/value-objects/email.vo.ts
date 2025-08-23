import { z } from 'zod';
import { messages } from '@/shared/constants/messages';

export const EmailSchema = z
  .string({ required_error: messages.validation.required })
  .email(messages.validation.email)
  .min(5, messages.validation.emailTooShort)
  .max(255, messages.validation.emailTooLong)
  .toLowerCase()
  .transform((email) => email.trim());

export class Email {
  private constructor(private readonly value: string) {}

  static create(email: string): Email {
    const validated = EmailSchema.parse(email);
    return new Email(validated);
  }

  getValue(): string {
    return this.value;
  }

  getDomain(): string {
    return this.value.split('@')[1];
  }

  isCompanyEmail(): boolean {
    const personalDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'];
    return !personalDomains.includes(this.getDomain());
  }
}