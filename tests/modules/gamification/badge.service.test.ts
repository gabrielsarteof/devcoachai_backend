import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadgeService } from '@/modules/gamification/domain/services/badge.service';
import { BadgeEntity } from '@/modules/gamification/domain/entities/badge.entity';
import { BadgeCategory } from '@/modules/gamification/domain/enums/badge-category.enum';
import { Rarity } from '@prisma/client';

vi.mock('@/shared/infrastructure/monitoring/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockBadgeRepository = {
  findById: vi.fn(),
  findByKey: vi.fn(),
  findAll: vi.fn(),
  findByUserId: vi.fn(),
  unlock: vi.fn(),
  isUnlocked: vi.fn(),
  updateProgress: vi.fn(),
  getProgress: vi.fn(),
  getUserData: vi.fn(),
};

const mockCacheService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
};

describe('BadgeService', () => {
  let badgeService: BadgeService;

  beforeEach(() => {
    vi.clearAllMocks();
    badgeService = new BadgeService(mockBadgeRepository, mockCacheService);
  });

  describe('evaluateBadges', () => {
    const mockUserData = {
      userId: 'user-123',
      totalXP: 250,
      currentLevel: 3,
      currentStreak: 5,
      challengesCompleted: 8,
      metrics: {
        averageDI: 85,
        averagePR: 75,
        averageCS: 90,
      },
    };

    const createMockBadge = (index: number, data: any) => {
      const badge = BadgeEntity.create(data);
      vi.spyOn(badge, 'getId').mockReturnValue(`mock-badge-${index}`);
      return badge;
    };

    const mockBadges = [
      createMockBadge(1, {
        key: 'xp-collector',
        name: 'Coletor de XP',
        description: 'Colete 200 XP',
        icon: '⭐',
        rarity: Rarity.COMMON,
        category: BadgeCategory.MILESTONE,
        requirement: { type: 'xp', threshold: 200 },
        xpReward: 50,
        visible: true,
      }),
      createMockBadge(2, {
        key: 'level-achiever',
        name: 'Conquistador de Nível',
        description: 'Alcance o nível 5',
        icon: '🏆',
        rarity: Rarity.RARE,
        category: BadgeCategory.MILESTONE,
        requirement: { type: 'level', threshold: 5 },
        xpReward: 100,
        visible: true,
      }),
      createMockBadge(3, {
        key: 'challenge-master',
        name: 'Mestre dos Desafios',
        description: 'Complete 10 desafios',
        icon: '🎯',
        rarity: Rarity.EPIC,
        category: BadgeCategory.CRAID,
        requirement: { type: 'challenges', challengeCount: 10 },
        xpReward: 200,
        visible: true,
      }),
    ];

    beforeEach(() => {
      mockBadgeRepository.getUserData.mockResolvedValue(mockUserData);
      mockBadgeRepository.findByUserId.mockResolvedValue([]);
      mockCacheService.get.mockResolvedValue(null);
      mockBadgeRepository.findAll.mockResolvedValue(mockBadges);
    });

    it('should evaluate and unlock eligible badges', async () => {
      const result = await badgeService.evaluateBadges('user-123');

      expect(result.unlocked).toHaveLength(1);
      expect(result.unlocked[0].getKey()).toBe('xp-collector');
      expect(result.progress.size).toBe(2);
      expect(result.progress.get(mockBadges[1].getId())).toBe(60);
      expect(result.progress.get(mockBadges[2].getId())).toBe(80);
    });

    it('should skip already unlocked badges', async () => {
      const unlockedBadge = mockBadges[0];
      mockBadgeRepository.findByUserId.mockResolvedValue([unlockedBadge]);

      const result = await badgeService.evaluateBadges('user-123');

      expect(result.unlocked).toHaveLength(0);
      expect(result.progress.size).toBe(2);
    });

    it('should handle evaluation errors gracefully', async () => {
      mockBadgeRepository.getUserData.mockRejectedValue(new Error('Database error'));

      await expect(badgeService.evaluateBadges('user-123')).rejects.toThrow('Database error');
    });

    it('should use cached badges when available', async () => {
      mockCacheService.get.mockResolvedValue(mockBadges);

      await badgeService.evaluateBadges('user-123');

      expect(mockBadgeRepository.findAll).not.toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalledWith('badges:all');
    });
  });

  describe('unlockBadge', () => {
    const mockBadge = BadgeEntity.createForTests({
      key: 'test-badge',
      name: 'Test Badge',
      description: 'A test badge',
      icon: '🧪',
      rarity: Rarity.COMMON,
      category: BadgeCategory.SPECIAL,
      requirement: { type: 'special', customCondition: 'test' },
      xpReward: 25,
      visible: true,
    });

    it('should unlock badge successfully', async () => {
      mockBadgeRepository.findById.mockResolvedValue(mockBadge);
      mockBadgeRepository.isUnlocked.mockResolvedValue(false);
      mockBadgeRepository.unlock.mockResolvedValue(undefined);
      mockCacheService.keys.mockResolvedValue(['gamification:user:123:badges']);

      const result = await badgeService.unlockBadge('user-123', 'badge-456');

      expect(mockBadgeRepository.unlock).toHaveBeenCalledWith('user-123', 'badge-456');
      expect(mockCacheService.del).toHaveBeenCalled();
      expect(result).toBe(mockBadge);
    });

    it('should throw error if badge not found', async () => {
      mockBadgeRepository.findById.mockResolvedValue(null);

      await expect(badgeService.unlockBadge('user-123', 'invalid-badge'))
        .rejects.toThrow('Badge not found');
    });

    it('should throw error if badge already unlocked', async () => {
      mockBadgeRepository.findById.mockResolvedValue(mockBadge);
      mockBadgeRepository.isUnlocked.mockResolvedValue(true);

      await expect(badgeService.unlockBadge('user-123', 'badge-456'))
        .rejects.toThrow('Badge already unlocked');
    });
  });

  describe('getAllBadges', () => {
    const mockBadges = [
      BadgeEntity.createForTests({
        key: 'badge-1',
        name: 'Badge 1',
        description: 'First badge',
        icon: '1️⃣',
        rarity: Rarity.COMMON,
        category: BadgeCategory.MILESTONE,
        requirement: { type: 'xp', threshold: 100 },
        xpReward: 50,
        visible: true,
      }),
    ];

    it('should return cached badges when available', async () => {
      mockCacheService.get.mockResolvedValue(mockBadges);

      const result = await badgeService.getAllBadges();

      expect(result).toEqual(mockBadges);
      expect(mockBadgeRepository.findAll).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should fetch and cache badges when not in cache', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockBadgeRepository.findAll.mockResolvedValue(mockBadges);

      const result = await badgeService.getAllBadges();

      expect(result).toEqual(mockBadges);
      expect(mockBadgeRepository.findAll).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalledWith('badges:all', mockBadges, 1800);
    });
  });

  describe('getUserBadges', () => {
    it('should return user badges from repository', async () => {
      const mockUserBadges = [
        BadgeEntity.createForTests({
          key: 'user-badge',
          name: 'User Badge',
          description: 'A user badge',
          icon: '👤',
          rarity: Rarity.COMMON,
          category: BadgeCategory.MILESTONE,
          requirement: { type: 'xp', threshold: 50 },
          xpReward: 25,
          visible: true,
        }),
      ];

      mockBadgeRepository.findByUserId.mockResolvedValue(mockUserBadges);

      const result = await badgeService.getUserBadges('user-123');

      expect(result).toEqual(mockUserBadges);
      expect(mockBadgeRepository.findByUserId).toHaveBeenCalledWith('user-123');
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate user cache patterns', async () => {
      const mockKeys = [
        'gamification:user:123:badges:unlocked',
        'gamification:user:123:badges:progress',
        'gamification:badges:all',
      ];

      mockCacheService.keys.mockResolvedValue(mockKeys);

      await badgeService['invalidateUserCache']('user-123');

      expect(mockCacheService.keys).toHaveBeenCalledTimes(2);
      expect(mockCacheService.del).toHaveBeenCalledTimes(mockKeys.length);
    });

    it('should handle empty cache keys gracefully', async () => {
      mockCacheService.keys.mockResolvedValue([]);

      await expect(badgeService['invalidateUserCache']('user-123')).resolves.not.toThrow();
    });
  });
});