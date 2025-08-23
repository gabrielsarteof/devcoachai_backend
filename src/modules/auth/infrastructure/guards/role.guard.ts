import type { FastifyRequest } from 'fastify';
import { UserRole } from '@/shared/domain/enums';

export class RoleGuard {
  static isAdmin(request: FastifyRequest): boolean {
    const user = request.user as { id: string; email: string; role: string } | undefined;
    return user?.role === UserRole.TECH_LEAD || 
           user?.role === UserRole.ARCHITECT;
  }

  static isSenior(request: FastifyRequest): boolean {
    const user = request.user as { id: string; email: string; role: string } | undefined;
    return user?.role === UserRole.SENIOR ||
           user?.role === UserRole.TECH_LEAD ||
           user?.role === UserRole.ARCHITECT;
  }

  static canAccessPremiumFeatures(request: FastifyRequest): boolean {
    return this.isSenior(request);
  }

  static async checkOwnership(
    request: FastifyRequest,
    resourceOwnerId: string
  ): Promise<boolean> {
    const user = request.user as { id: string; email: string; role: string } | undefined;
    if (!user) return false;
    
    if (this.isAdmin(request)) return true;
    
    return user.id === resourceOwnerId;
  }
}
