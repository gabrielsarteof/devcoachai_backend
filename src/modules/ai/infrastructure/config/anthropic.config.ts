import { AIProvider } from '@prisma/client';

export { AIProvider };

export const isValidProvider = (value: string): value is keyof typeof AIProvider => {
  return Object.keys(AIProvider).includes(value.toUpperCase());
};

export const toAIProvider = (value: string): AIProvider => {
  const upper = value.toUpperCase();
  if (!isValidProvider(upper)) {
    throw new Error(`Invalid provider: ${value}`);
  }
  return AIProvider[upper as keyof typeof AIProvider];
};

export const providerToString = (provider: AIProvider): string => {
  return provider.toLowerCase();
};