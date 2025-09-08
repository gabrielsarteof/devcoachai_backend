import { User as PrismaUser } from '@prisma/client';
import { Email } from '@/shared/domain/value-objects/email.vo';
import { Password } from '@/shared/domain/value-objects/password.vo';
import { CreateUserDTO } from '../schemas/create-user.schema';
import { logger } from '@/shared/infrastructure/monitoring/logger';

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
        id: crypto.randomUUID(),
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
    logger.debug({
      operation: 'user_entity_from_prisma',
      userId: user.id,
      email: user.email,
      role: user.role,
      level: user.currentLevel,
      xp: user.totalXp,
      streak: user.currentStreak,
      lastLoginAt: user.lastLoginAt,
      emailVerified: user.emailVerified,
      onboardingCompleted: user.onboardingCompleted
    }, 'Creating user entity from Prisma model');

    try {
      const email = Email.create(user.email);
      const password = Password.fromHash(user.password);
      
      logger.debug({
        userId: user.id,
        emailDomain: email.getDomain(),
        isCompanyEmail: email.isCompanyEmail()
      }, 'User entity created from Prisma successfully');
      
      return new UserEntity(user, email, password);
    } catch (error) {
      logger.error({
        operation: 'user_entity_from_prisma_failed',
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to create user entity from Prisma model');
      
      throw error;
    }
  }

  async verifyPassword(plainPassword: string): Promise<boolean> {
    logger.debug({
      operation: 'password_verification',
      userId: this.props.id,
      hasPassword: !!this.password
    }, 'Verifying user password');

    if (!this.password) {
      logger.warn({
        userId: this.props.id,
        reason: 'no_password_set'
      }, 'Password verification failed - no password set');
      return false;
    }

    try {
      const isValid = await this.password.compare(plainPassword);
      
      logger.info({
        userId: this.props.id,
        email: this.props.email,
        isValid,
        operation: 'password_verification_result'
      }, isValid ? 'Password verification successful' : 'Password verification failed');

      return isValid;
    } catch (error) {
      logger.error({
        operation: 'password_verification_error',
        userId: this.props.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'Password verification error');
      
      return false;
    }
  }

  isFromCompany(companyId: string): boolean {
    const result = this.props.companyId === companyId;
    
    logger.debug({
      operation: 'company_membership_check',
      userId: this.props.id,
      userCompanyId: this.props.companyId,
      checkingCompanyId: companyId,
      isMember: result
    }, 'Company membership verification');

    return result;
  }

  canAccessPremiumFeatures(): boolean {
    const canAccess = this.props.currentLevel >= 5;
    
    logger.debug({
      operation: 'premium_access_check',
      userId: this.props.id,
      currentLevel: this.props.currentLevel,
      requiredLevel: 5,
      canAccess
    }, 'Premium features access verification');

    return canAccess;
  }

  addXP(amount: number): void {
    const previousXp = this.props.totalXp;
    const previousLevel = this.props.currentLevel;
    
    logger.info({
      operation: 'xp_addition',
      userId: this.props.id,
      previousXp,
      xpAmount: amount,
      previousLevel
    }, 'Adding XP to user');

    this.props.totalXp += amount;
    this.updateLevel();

    const newLevel = this.props.currentLevel;
    const levelUp = newLevel > previousLevel;

    logger.info({
      operation: 'xp_addition_completed',
      userId: this.props.id,
      previousXp,
      newXp: this.props.totalXp,
      previousLevel,
      newLevel,
      levelUp,
      xpGained: amount
    }, levelUp ? 'User leveled up!' : 'XP added successfully');

    if (levelUp) {
      logger.info({
        userId: this.props.id,
        email: this.props.email,
        name: this.props.name,
        fromLevel: previousLevel,
        toLevel: newLevel,
        totalXp: this.props.totalXp,
        levelUpEvent: true
      }, 'USER LEVEL UP EVENT');
    }
  }

  private updateLevel(): void {
    const xpThresholds = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000];
    const previousLevel = this.props.currentLevel;
    
    for (let i = xpThresholds.length - 1; i >= 0; i--) {
      if (this.props.totalXp >= xpThresholds[i]) {
        this.props.currentLevel = i + 1;
        break;
      }
    }

    if (previousLevel !== this.props.currentLevel) {
      logger.info({
        operation: 'level_calculation',
        userId: this.props.id,
        totalXp: this.props.totalXp,
        previousLevel,
        newLevel: this.props.currentLevel,
        thresholds: xpThresholds
      }, 'User level updated');
    }
  }

  toPrisma(): PrismaUser {
    logger.debug({
      operation: 'user_to_prisma',
      userId: this.props.id,
      level: this.props.currentLevel,
      xp: this.props.totalXp,
      streak: this.props.currentStreak
    }, 'Converting user entity to Prisma model');

    return this.props;
  }

  toJSON() {
    logger.debug({
      operation: 'user_to_json',
      userId: this.props.id,
      includesPassword: false
    }, 'Converting user entity to JSON (password excluded)');

    const { password: _password, ...userWithoutPassword } = this.props;
    return userWithoutPassword;
  }

  getId(): string { 
    logger.debug({
      operation: 'get_user_id',
      userId: this.props.id
    }, 'Getting user ID');
    return this.props.id; 
  }
  
  getEmail(): string { 
    logger.debug({
      operation: 'get_user_email',
      userId: this.props.id,
      emailDomain: this.email.getDomain()
    }, 'Getting user email');
    return this.props.email; 
  }
  
  getName(): string { 
    logger.debug({
      operation: 'get_user_name',
      userId: this.props.id,
      nameLength: this.props.name.length
    }, 'Getting user name');
    return this.props.name; 
  }
  
  getLevel(): number { 
    logger.debug({
      operation: 'get_user_level',
      userId: this.props.id,
      level: this.props.currentLevel
    }, 'Getting user level');
    return this.props.currentLevel; 
  }
  
  getXP(): number { 
    logger.debug({
      operation: 'get_user_xp',
      userId: this.props.id,
      xp: this.props.totalXp
    }, 'Getting user XP');
    return this.props.totalXp; 
  }
  
  getStreak(): number { 
    logger.debug({
      operation: 'get_user_streak',
      userId: this.props.id,
      streak: this.props.currentStreak
    }, 'Getting user streak');
    return this.props.currentStreak; 
  }
}