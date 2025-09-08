import { Certificate as PrismaCertificate } from '@prisma/client';
import { CreateCertificateDTO } from '../schemas/certificate.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import * as crypto from 'crypto';

export class CertificateEntity {
  private constructor(private readonly props: PrismaCertificate) {}

  static create(data: CreateCertificateDTO): CertificateEntity {
    const startTime = Date.now();
    
    logger.info({
      operation: 'certificate_entity_creation',
      userId: data.userId,
      level: data.level,
      theoryScore: data.theoryScore,
      practicalScore: data.practicalScore,
      portfolioScore: data.portfolioScore,
      skillsCount: data.skills.length,
      challengesCompleted: data.challengesCompleted,
      totalHours: data.totalHours,
      averageDI: data.averageDI,
      averagePR: data.averagePR,
      averageCS: data.averageCS
    }, 'Creating certificate entity');

    try {
      const finalScore = CertificateEntity.calculateFinalScore(
        data.theoryScore,
        data.practicalScore,
        data.portfolioScore
      );

      const code = CertificateEntity.generateCode();
      const verificationHash = CertificateEntity.generateHash(code);
      const grade = CertificateEntity.calculateGrade(finalScore);

      const props = {
        id: crypto.randomUUID(),
        code,
        userId: data.userId,
        level: data.level,
        theoryScore: data.theoryScore,
        practicalScore: data.practicalScore,
        portfolioScore: data.portfolioScore,
        finalScore,
        grade,
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

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'certificate_entity_creation_success',
        certificateId: props.id,
        code: props.code,
        userId: data.userId,
        level: data.level,
        finalScore,
        grade,
        theoryScore: data.theoryScore,
        practicalScore: data.practicalScore,
        portfolioScore: data.portfolioScore,
        skillsCount: data.skills.length,
        challengesCompleted: data.challengesCompleted,
        totalHours: data.totalHours,
        issuedAt: props.issuedAt,
        expiresAt: props.expiresAt,
        processingTime
      }, 'Certificate entity created successfully');

      logger.info({
        certificateId: props.id,
        userId: data.userId,
        code: props.code,
        level: data.level,
        grade,
        finalScore,
        certificationEvent: true
      }, 'CERTIFICATE ISSUED EVENT');

      return new CertificateEntity(props);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_entity_creation_failed',
        userId: data.userId,
        level: data.level,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create certificate entity');
      
      throw error;
    }
  }

  private static calculateFinalScore(
    theory: number,
    practical: number,
    portfolio: number
  ): number {
    logger.debug({
      operation: 'calculate_final_score',
      theoryScore: theory,
      practicalScore: practical,
      portfolioScore: portfolio,
      weights: { theory: 0.3, practical: 0.5, portfolio: 0.2 }
    }, 'Calculating certificate final score');

    const finalScore = theory * 0.3 + practical * 0.5 + portfolio * 0.2;
    
    logger.debug({
      operation: 'final_score_calculated',
      theoryComponent: theory * 0.3,
      practicalComponent: practical * 0.5,
      portfolioComponent: portfolio * 0.2,
      finalScore
    }, 'Final score calculated');

    return finalScore;
  }

  private static calculateGrade(score: number): string {
    logger.debug({
      operation: 'calculate_grade',
      score
    }, 'Calculating certificate grade');

    let grade: string;
    if (score >= 90) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 80) grade = 'B+';
    else if (score >= 75) grade = 'B';
    else if (score >= 70) grade = 'C+';
    else if (score >= 65) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    logger.debug({
      operation: 'grade_calculated',
      score,
      grade,
      isPassing: grade !== 'F'
    }, 'Certificate grade calculated');

    return grade;
  }

  private static generateCode(): string {
    logger.debug({
      operation: 'generate_certificate_code'
    }, 'Generating certificate code');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'CRAID-';

    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    logger.debug({
      operation: 'certificate_code_generated',
      codeFormat: 'CRAID-XXXX-XXXX',
      codeLength: code.length
    }, 'Certificate code generated successfully');

    return code;
  }

  private static generateHash(code: string): string {
    logger.debug({
      operation: 'generate_verification_hash',
      hasSecretKey: !!process.env.JWT_SECRET
    }, 'Generating verification hash');

    const hash = crypto
      .createHash('sha256')
      .update(code + process.env.JWT_SECRET)
      .digest('hex');

    logger.debug({
      operation: 'verification_hash_generated',
      hashLength: hash.length
    }, 'Verification hash generated successfully');

    return hash;
  }

  private static generateQRData(code: string): string {
    logger.debug({
      operation: 'generate_qr_data',
      code
    }, 'Generating QR code data');

    const qrData = `https://devaicoach.com/verify/${code}`;
    
    logger.debug({
      operation: 'qr_data_generated',
      qrDataLength: qrData.length
    }, 'QR code data generated successfully');

    return qrData;
  }

  static fromPrisma(cert: PrismaCertificate): CertificateEntity {
    logger.debug({
      operation: 'certificate_entity_from_prisma',
      certificateId: cert.id,
      code: cert.code,
      userId: cert.userId,
      level: cert.level,
      grade: cert.grade,
      finalScore: cert.finalScore,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      challengesCompleted: cert.challengesCompleted,
      skillsCount: cert.skills.length
    }, 'Creating certificate entity from Prisma model');

    const entity = new CertificateEntity(cert);
    
    logger.debug({
      certificateId: cert.id,
      isValid: entity.isValid(),
      isPassing: entity.isPassing()
    }, 'Certificate entity created from Prisma successfully');
    
    return entity;
  }

  verify(code: string): boolean {
    logger.debug({
      operation: 'verify_certificate',
      certificateId: this.props.id,
      providedCode: code,
      storedCode: this.props.code
    }, 'Verifying certificate code');

    try {
      const hash = CertificateEntity.generateHash(code);
      const isValid = hash === this.props.verificationHash;
      
      logger.info({
        operation: 'certificate_verification_result',
        certificateId: this.props.id,
        code: this.props.code,
        isValid,
        providedCode: code
      }, isValid ? 'Certificate verification successful' : 'Certificate verification failed');

      if (!isValid) {
        logger.warn({
          certificateId: this.props.id,
          providedCode: code,
          storedCode: this.props.code,
          reason: 'hash_mismatch'
        }, 'Certificate verification failed - hash mismatch');
      }

      return isValid;
    } catch (error) {
      logger.error({
        operation: 'certificate_verification_error',
        certificateId: this.props.id,
        providedCode: code,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Certificate verification error');
      
      return false;
    }
  }

  isValid(): boolean {
    const now = new Date();
    const isValid = now < new Date(this.props.expiresAt);
    
    logger.debug({
      operation: 'check_certificate_validity',
      certificateId: this.props.id,
      code: this.props.code,
      currentDate: now,
      expiresAt: this.props.expiresAt,
      isValid
    }, 'Checking certificate validity');

    if (!isValid) {
      logger.warn({
        certificateId: this.props.id,
        code: this.props.code,
        expiresAt: this.props.expiresAt,
        daysExpired: Math.floor((now.getTime() - new Date(this.props.expiresAt).getTime()) / (1000 * 60 * 60 * 24)),
        expired: true
      }, 'Certificate has expired');
    }

    return isValid;
  }

  isPassing(): boolean {
    const isPassing = this.props.finalScore >= 60;
    
    logger.debug({
      operation: 'check_passing_score',
      certificateId: this.props.id,
      finalScore: this.props.finalScore,
      requiredScore: 60,
      isPassing,
      grade: this.props.grade
    }, 'Checking if certificate has passing score');

    return isPassing;
  }

  getLevel(): string {
    const levels = {
      FOUNDATION: 'Foundation Developer',
      PROFESSIONAL: 'Professional Developer',
      EXPERT: 'Expert Architect',
    };
    
    const levelDescription = levels[this.props.level];
    
    logger.debug({
      operation: 'get_certificate_level',
      certificateId: this.props.id,
      level: this.props.level,
      levelDescription
    }, 'Getting certificate level description');

    return levelDescription;
  }

  toPrisma(): PrismaCertificate {
    logger.debug({
      operation: 'certificate_to_prisma',
      certificateId: this.props.id,
      code: this.props.code,
      level: this.props.level,
      grade: this.props.grade
    }, 'Converting certificate entity to Prisma model');

    return this.props;
  }

  toPublicJSON() {
    logger.debug({
      operation: 'certificate_to_public_json',
      certificateId: this.props.id,
      code: this.props.code,
      level: this.props.level,
      grade: this.props.grade,
      isValid: this.isValid(),
      isPassing: this.isPassing()
    }, 'Converting certificate entity to public JSON');

    const publicData = {
      code: this.props.code,
      level: this.props.level,
      grade: this.props.grade,
      issuedAt: this.props.issuedAt,
      expiresAt: this.props.expiresAt,
      valid: this.isValid(),
      verificationUrl: this.props.qrCode,
    };

    logger.debug({
      certificateId: this.props.id,
      publicDataKeys: Object.keys(publicData),
      excludesSensitiveData: true
    }, 'Public JSON data prepared');

    return publicData;
  }
}