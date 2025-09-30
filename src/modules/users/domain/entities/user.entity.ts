import { User as PrismaUser } from '@prisma/client';
import { Email } from '@/shared/domain/value-objects/email.vo';
import { Password } from '@/shared/domain/value-objects/password.vo';
import { CreateUserDTO } from '../schemas/create-user.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

export class UserEntity {
  private constructor(
    private readonly props: PrismaUser,
    private readonly email: Email,
    private password?: Password
  ) {}

  static async createNew(data: CreateUserDTO): Promise<UserEntity> {
    const startTime = Date.now();
    
    logger.info({
      operation: 'user_entity_creation',
      email: data.email,
      name: data.name,
      role: data.role,
      yearsOfExperience: data.yearsOfExperience,
      companyId: data.companyId,
      teamId: data.teamId,
      hasPreferredLanguages: data.preferredLanguages.length > 0,
      preferredLanguagesCount: data.preferredLanguages.length
    }, 'Creating new user entity');

    try {
      const email = Email.create(data.email);
      const password = await Password.create(data.password);

      const props = {
        id: randomUUID(),
        email: email.getValue(),
        password: password.getHash(),
        name: data.name,
        avatarUrl: data.avatarUrl || null,
        role: data.role,
        position: data.position || null,
        yearsOfExperience: data.yearsOfExperience,
        preferredLanguages: data.preferredLanguages,
        githubUsername: data.githubUsername || null,
        companyId: data.companyId || null,
        teamId: data.teamId || null,
        emailVerified: false,
        termsAcceptedAt: null,
        onboardingCompleted: false,
        lastLoginAt: null,
        currentLevel: 1,
        totalXp: 0,
        currentStreak: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PrismaUser;

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'user_entity_creation_success',
        userId: props.id,
        email: data.email,
        name: data.name,
        role: data.role,
        level: props.currentLevel,
        xp: props.totalXp,
        streak: props.currentStreak,
        processingTime
      }, 'User entity created successfully');

      return new UserEntity(props, email, password);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'user_entity_creation_failed',
        email: data.email,
        name: data.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create user entity');
      
      throw error;
    }
  }

  static fromPrisma(user: PrismaUser): UserEntity {
    try {
      const email = Email.create(user.email);
      const password = Password.fromHash(user.password);

      return new UserEntity(user, email, password);
    } catch (error) {
      logger.error({
        operation: 'user_entity_from_prisma_failed',
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to create user entity from Prisma model');

      throw error;
    }
  }

  async verifyPassword(plainPassword: string): Promise<boolean> {
    if (!this.password) {
      return false;
    }

    try {
      const isValid = await this.password.compare(plainPassword);

      logger.info({
        userId: this.props.id,
        isValid,
        operation: 'password_verification'
      }, isValid ? 'Password verification successful' : 'Password verification failed');

      return isValid;
    } catch (error) {
      logger.error({
        operation: 'password_verification_error',
        userId: this.props.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Password verification error');

      return false;
    }
  }

  isFromCompany(companyId: string): boolean {
    return this.props.companyId === companyId;
  }

  canAccessPremiumFeatures(): boolean {
    return this.props.currentLevel >= 5;
  }

  addXP(amount: number): void {
    const previousXp = this.props.totalXp;
    const previousLevel = this.props.currentLevel;

    this.props.totalXp += amount;
    this.updateLevel();

    const newLevel = this.props.currentLevel;
    const levelUp = newLevel > previousLevel;

    if (levelUp) {
      logger.info({
        userId: this.props.id,
        email: this.props.email,
        name: this.props.name,
        fromLevel: previousLevel,
        toLevel: newLevel,
        totalXp: this.props.totalXp,
        xpGained: amount
      }, 'User leveled up');
    }
  }

  private updateLevel(): void {
    const xpThresholds = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000];

    for (let i = xpThresholds.length - 1; i >= 0; i--) {
      if (this.props.totalXp >= xpThresholds[i]) {
        this.props.currentLevel = i + 1;
        break;
      }
    }
  }

  toPrisma(): PrismaUser {
    return this.props;
  }

  toJSON() {
    const { password: _password, ...userWithoutPassword } = this.props;
    return userWithoutPassword;
  }

  getId(): string {
    return this.props.id;
  }

  getEmail(): string {
    return this.props.email;
  }

  getName(): string {
    return this.props.name;
  }

  getLevel(): number {
    return this.props.currentLevel;
  }

  getXP(): number {
    return this.props.totalXp;
  }

  getStreak(): number {
    return this.props.currentStreak;
  }
}