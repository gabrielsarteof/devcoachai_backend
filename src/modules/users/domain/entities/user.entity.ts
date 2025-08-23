import { User as PrismaUser } from '@prisma/client';
import { Email } from '@/shared/domain/value-objects/email.vo';
import { Password } from '@/shared/domain/value-objects/password.vo';
import { CreateUserDTO } from '../schemas/create-user.schema';

export class UserEntity {
  private constructor(
    private readonly props: PrismaUser,
    private readonly email: Email,
    private password?: Password
  ) {}

  static async createNew(data: CreateUserDTO): Promise<UserEntity> {
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

    return new UserEntity(props, email, password);
  }

  static fromPrisma(user: PrismaUser): UserEntity {
    const email = Email.create(user.email);
    const password = Password.fromHash(user.password);
    return new UserEntity(user, email, password);
  }

  async verifyPassword(plainPassword: string): Promise<boolean> {
    if (!this.password) return false;
    return this.password.compare(plainPassword);
  }

  isFromCompany(companyId: string): boolean {
    return this.props.companyId === companyId;
  }

  canAccessPremiumFeatures(): boolean {
    return this.props.currentLevel >= 5;
  }

  addXP(amount: number): void {
    this.props.totalXp += amount;
    this.updateLevel();
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

  getId(): string { return this.props.id; }
  getEmail(): string { return this.props.email; }
  getName(): string { return this.props.name; }
  getLevel(): number { return this.props.currentLevel; }
  getXP(): number { return this.props.totalXp; }
  getStreak(): number { return this.props.currentStreak; }
}