import { z } from 'zod';
import { CertLevel } from '@/shared/domain/enums';

export const CreateCertificateSchema = z.object({
  userId: z.string().cuid(),
  level: z.nativeEnum(CertLevel),

  theoryScore: z.number().min(0).max(100),
  practicalScore: z.number().min(0).max(100),
  portfolioScore: z.number().min(0).max(100),

  skills: z.array(z.string()),
  challengesCompleted: z.number().int().min(0),
  totalHours: z.number().min(0),

  averageDI: z.number().min(0).max(100),
  averagePR: z.number().min(0).max(100),
  averageCS: z.number().min(0).max(10),
});

export type CreateCertificateDTO = z.infer<typeof CreateCertificateSchema>;

export const VerifyCertificateSchema = z.object({
  code: z.string().length(12).toUpperCase(),
});

export type VerifyCertificateDTO = z.infer<typeof VerifyCertificateSchema>;
