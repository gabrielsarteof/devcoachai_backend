import { CertificateEntity } from '../entities/certificate.entity';
import { CertLevel } from '@/shared/domain/enums';

export interface ICertificateRepository {
  create(certificate: CertificateEntity): Promise<void>;
  findById(id: string): Promise<CertificateEntity | null>;
  findByCode(code: string): Promise<CertificateEntity | null>;
  findByUserId(userId: string): Promise<CertificateEntity[]>;
  findByUserIdAndLevel(userId: string, level: CertLevel): Promise<CertificateEntity | null>;
  update(id: string, data: Partial<CertificateEntity>): Promise<CertificateEntity>;
  delete(id: string): Promise<void>;
  findExpired(): Promise<CertificateEntity[]>;
  countByLevel(level: CertLevel): Promise<number>;
  findRecentCertificates(limit: number): Promise<CertificateEntity[]>;
}