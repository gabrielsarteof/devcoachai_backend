import { PrismaClient } from '@prisma/client';
import { CertificateEntity } from '../../domain/entities/certificate.entity';
import { ICertificateRepository } from '../../domain/repositories/certificate.repository.interface';
import { CertLevel } from '@/shared/domain/enums';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class CertificateRepository implements ICertificateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(certificate: CertificateEntity): Promise<void> {
    const startTime = Date.now();
    const certData = certificate.toPrisma();
    
    logger.info({
      operation: 'certificate_repository_create',
      certificateId: certData.id,
      userId: certData.userId,
      level: certData.level,
      code: certData.code
    }, 'Creating certificate in database');

    try {
      await this.prisma.certificate.create({
        data: certData,
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'certificate_repository_create_success',
        certificateId: certData.id,
        userId: certData.userId,
        level: certData.level,
        code: certData.code,
        processingTime
      }, 'Certificate created successfully in database');
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_create_failed',
        certificateId: certData.id,
        userId: certData.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create certificate in database');
      
      throw error;
    }
  }

  async findById(id: string): Promise<CertificateEntity | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'certificate_repository_find_by_id',
      certificateId: id
    }, 'Finding certificate by ID');

    try {
      const certificate = await this.prisma.certificate.findUnique({
        where: { id },
      });

      const processingTime = Date.now() - startTime;
      
      if (certificate) {
        logger.debug({
          operation: 'certificate_repository_find_by_id_success',
          certificateId: id,
          level: certificate.level,
          code: certificate.code,
          processingTime
        }, 'Certificate found by ID');
        
        return CertificateEntity.fromPrisma(certificate);
      }

      logger.debug({
        operation: 'certificate_repository_find_by_id_not_found',
        certificateId: id,
        processingTime
      }, 'Certificate not found by ID');
      
      return null;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_by_id_failed',
        certificateId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find certificate by ID');
      
      throw error;
    }
  }

  async findByCode(code: string): Promise<CertificateEntity | null> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'certificate_repository_find_by_code',
      code,
      codeLength: code.length
    }, 'Finding certificate by code');

    try {
      const certificate = await this.prisma.certificate.findUnique({
        where: { code },
      });

      const processingTime = Date.now() - startTime;
      
      if (certificate) {
        logger.info({
          operation: 'certificate_repository_find_by_code_success',
          code,
          certificateId: certificate.id,
          level: certificate.level,
          grade: certificate.grade,
          issuedAt: certificate.issuedAt,
          processingTime
        }, 'Certificate found by code');
        
        return CertificateEntity.fromPrisma(certificate);
      }

      logger.warn({
        operation: 'certificate_repository_find_by_code_not_found',
        code,
        processingTime
      }, 'Certificate not found by code');
      
      return null;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_by_code_failed',
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find certificate by code');
      
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<CertificateEntity[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'certificate_repository_find_by_user_id',
      userId
    }, 'Finding certificates by user ID');

    try {
      const certificates = await this.prisma.certificate.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'certificate_repository_find_by_user_id_success',
        userId,
        certificatesFound: certificates.length,
        processingTime
      }, 'Certificates found by user ID');

      return certificates.map(cert => CertificateEntity.fromPrisma(cert));
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_by_user_id_failed',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find certificates by user ID');
      
      throw error;
    }
  }

  async findByUserIdAndLevel(userId: string, level: CertLevel): Promise<CertificateEntity | null> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'certificate_repository_find_by_user_and_level',
      userId,
      level
    }, 'Finding certificate by user ID and level');

    try {
      const certificate = await this.prisma.certificate.findFirst({
        where: {
          userId,
          level,
        },
        orderBy: { issuedAt: 'desc' },
      });

      const processingTime = Date.now() - startTime;
      
      if (certificate) {
        logger.debug({
          operation: 'certificate_repository_find_by_user_and_level_success',
          userId,
          level,
          certificateId: certificate.id,
          code: certificate.code,
          processingTime
        }, 'Certificate found by user ID and level');
        
        return CertificateEntity.fromPrisma(certificate);
      }

      logger.debug({
        operation: 'certificate_repository_find_by_user_and_level_not_found',
        userId,
        level,
        processingTime
      }, 'Certificate not found by user ID and level');
      
      return null;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_by_user_and_level_failed',
        userId,
        level,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find certificate by user ID and level');
      
      throw error;
    }
  }

  async update(id: string, data: Partial<CertificateEntity>): Promise<CertificateEntity> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'certificate_repository_update',
      certificateId: id,
      fieldsToUpdate: Object.keys(data)
    }, 'Updating certificate');

    try {
      const updated = await this.prisma.certificate.update({
        where: { id },
        data: data as any,
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'certificate_repository_update_success',
        certificateId: id,
        fieldsUpdated: Object.keys(data),
        processingTime
      }, 'Certificate updated successfully');

      return CertificateEntity.fromPrisma(updated);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_update_failed',
        certificateId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to update certificate');
      
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const startTime = Date.now();
    
    logger.warn({
      operation: 'certificate_repository_delete',
      certificateId: id
    }, 'Deleting certificate');

    try {
      await this.prisma.certificate.delete({
        where: { id },
      });

      const processingTime = Date.now() - startTime;
      
      logger.warn({
        operation: 'certificate_repository_delete_success',
        certificateId: id,
        processingTime
      }, 'Certificate deleted successfully');
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_delete_failed',
        certificateId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to delete certificate');
      
      throw error;
    }
  }

  async findExpired(): Promise<CertificateEntity[]> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'certificate_repository_find_expired'
    }, 'Finding expired certificates');

    try {
      const certificates = await this.prisma.certificate.findMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
        orderBy: { expiresAt: 'desc' },
      });

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'certificate_repository_find_expired_success',
        expiredCertificatesFound: certificates.length,
        processingTime
      }, 'Expired certificates found');

      return certificates.map(cert => CertificateEntity.fromPrisma(cert));
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_expired_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find expired certificates');
      
      throw error;
    }
  }

  async countByLevel(level: CertLevel): Promise<number> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'certificate_repository_count_by_level',
      level
    }, 'Counting certificates by level');

    try {
      const count = await this.prisma.certificate.count({
        where: { level },
      });

      const processingTime = Date.now() - startTime;
      
      logger.debug({
        operation: 'certificate_repository_count_by_level_success',
        level,
        count,
        processingTime
      }, 'Certificates counted by level');

      return count;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_count_by_level_failed',
        level,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to count certificates by level');
      
      throw error;
    }
  }

  async findRecentCertificates(limit: number): Promise<CertificateEntity[]> {
    const startTime = Date.now();
    
    logger.debug({
      operation: 'certificate_repository_find_recent',
      limit
    }, 'Finding recent certificates');

    try {
      const certificates = await this.prisma.certificate.findMany({
        orderBy: { issuedAt: 'desc' },
        take: limit,
      });

      const processingTime = Date.now() - startTime;
      
      logger.debug({
        operation: 'certificate_repository_find_recent_success',
        certificatesFound: certificates.length,
        limit,
        processingTime
      }, 'Recent certificates found');

      return certificates.map(cert => CertificateEntity.fromPrisma(cert));
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'certificate_repository_find_recent_failed',
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to find recent certificates');
      
      throw error;
    }
  }
}