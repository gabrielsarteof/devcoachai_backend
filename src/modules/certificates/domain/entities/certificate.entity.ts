import { Certificate as PrismaCertificate } from '@prisma/client';
import { CreateCertificateDTO } from '../schemas/certificate.schema';
import * as crypto from 'crypto';

export class CertificateEntity {
  private constructor(private readonly props: PrismaCertificate) {}

  static create(data: CreateCertificateDTO): CertificateEntity {
    const finalScore = CertificateEntity.calculateFinalScore(
      data.theoryScore,
      data.practicalScore,
      data.portfolioScore
    );

    const code = CertificateEntity.generateCode();
    const verificationHash = CertificateEntity.generateHash(code);

    const props = {
      id: crypto.randomUUID(),
      code,
      userId: data.userId,
      level: data.level,
      theoryScore: data.theoryScore,
      practicalScore: data.practicalScore,
      portfolioScore: data.portfolioScore,
      finalScore,
      grade: CertificateEntity.calculateGrade(finalScore),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years
      verificationHash,
      qrCode: CertificateEntity.generateQRData(code),
      skills: data.skills,
      challengesCompleted: data.challengesCompleted,
      totalHours: data.totalHours,
      averageDI: data.averageDI,
      averagePR: data.averagePR,
      averageCS: data.averageCS,
    } as PrismaCertificate;

    return new CertificateEntity(props);
  }

  private static calculateFinalScore(
    theory: number,
    practical: number,
    portfolio: number
  ): number {
    return theory * 0.3 + practical * 0.5 + portfolio * 0.2;
  }

  private static calculateGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 65) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private static generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'CRAID-';

    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
  }

  private static generateHash(code: string): string {
    return crypto
      .createHash('sha256')
      .update(code + process.env.JWT_SECRET)
      .digest('hex');
  }

  private static generateQRData(code: string): string {
    return `https://devaicoach.com/verify/${code}`;
  }

  static fromPrisma(cert: PrismaCertificate): CertificateEntity {
    return new CertificateEntity(cert);
  }

  verify(code: string): boolean {
    const hash = CertificateEntity.generateHash(code);
    return hash === this.props.verificationHash;
  }

  isValid(): boolean {
    return new Date() < new Date(this.props.expiresAt);
  }

  isPassing(): boolean {
    return this.props.finalScore >= 60;
  }

  getLevel(): string {
    const levels = {
      FOUNDATION: 'Foundation Developer',
      PROFESSIONAL: 'Professional Developer',
      EXPERT: 'Expert Architect',
    };
    return levels[this.props.level];
  }

  toPrisma(): PrismaCertificate {
    return this.props;
  }

  toPublicJSON() {
    return {
      code: this.props.code,
      level: this.props.level,
      grade: this.props.grade,
      issuedAt: this.props.issuedAt,
      expiresAt: this.props.expiresAt,
      valid: this.isValid(),
      verificationUrl: this.props.qrCode,
    };
  }
}
