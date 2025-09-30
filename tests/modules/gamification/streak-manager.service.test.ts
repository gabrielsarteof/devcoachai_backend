import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreakManagerService } from '@/modules/gamification/domain/services/streak-manager.service';
import { StreakEntity } from '@/modules/gamification/domain/entities/streak.entity';

vi.mock('@/shared/infrastructure/monitoring/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockStreakRepository = {
  findByUserId: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  findActiveStreaks: vi.fn(),
  findStreaksAtRisk: vi.fn(),
};

const mockCacheService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
};

describe('StreakManagerService', () => {
  let streakManager: StreakManagerService;

  beforeEach(() => {
    vi.clearAllMocks();
    streakManager = new StreakManagerService(mockStreakRepository, mockCacheService);
  });

  describe('updateStreak', () => {
    const mockActivityData = {
      xpEarned: 50,
      timeSpent: 600,
      projectsCompleted: 1,
    };

    it('should create new streak for user without existing streak', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(null);
      mockStreakRepository.findByUserId.mockResolvedValue(null);
      mockStreakRepository.create.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);

      vi.spyOn(mockStreak, 'updateActivity').mockReturnValue(true);
      vi.spyOn(StreakEntity, 'create').mockReturnValue(mockStreak);

      const result = await streakManager.updateStreak('user-123', mockActivityData);

      expect(mockStreakRepository.create).toHaveBeenCalledWith(mockStreak);
      expect(mockStreakRepository.save).toHaveBeenCalledWith(mockStreak);
      expect(result).toBe(mockStreak);
    });

    it('should update existing streak', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(null);
      mockStreakRepository.findByUserId.mockResolvedValue(mockStreak);
      mockCacheService.set.mockResolvedValue(undefined);

      vi.spyOn(mockStreak, 'updateActivity').mockReturnValue(true);

      const result = await streakManager.updateStreak('user-123', mockActivityData);

      expect(mockStreakRepository.save).toHaveBeenCalledWith(mockStreak);
      expect(mockCacheService.del).toHaveBeenCalledWith('user:user-123:streak');
      expect(result).toBe(mockStreak);
    });

    it('should return streak without saving if no update needed', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(null);
      mockStreakRepository.findByUserId.mockResolvedValue(mockStreak);
      mockCacheService.set.mockResolvedValue(undefined);

      vi.spyOn(mockStreak, 'updateActivity').mockReturnValue(false);

      const result = await streakManager.updateStreak('user-123', mockActivityData);

      expect(mockStreakRepository.save).not.toHaveBeenCalled();
      expect(mockCacheService.del).not.toHaveBeenCalled();
      expect(result).toBe(mockStreak);
    });

    it('should use cached streak when available', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 3,
        longestStreak: 8,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(mockStreak);
      vi.spyOn(mockStreak, 'updateActivity').mockReturnValue(true);

      const result = await streakManager.updateStreak('user-123', mockActivityData);

      expect(mockStreakRepository.findByUserId).not.toHaveBeenCalled();
      expect(result).toBe(mockStreak);
    });
  });

  describe('freezeStreak', () => {
    it('should freeze streak successfully', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 10,
        longestStreak: 15,
        lastActivityDate: new Date(),
        freezesUsed: 1,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockStreakRepository.findByUserId.mockResolvedValue(mockStreak);
      mockStreakRepository.save.mockResolvedValue(undefined);
      mockCacheService.del.mockResolvedValue(undefined);

      vi.spyOn(mockStreak, 'freeze').mockReturnValue(true);
      vi.spyOn(mockStreak, 'getFreezesAvailable').mockReturnValue(1);

      const result = await streakManager.freezeStreak('user-123');

      expect(result.success).toBe(true);
      expect(result.freezesRemaining).toBe(1);
      expect(mockStreakRepository.save).toHaveBeenCalledWith(mockStreak);
      expect(mockCacheService.del).toHaveBeenCalledWith('user:user-123:streak');
    });

    it('should fail to freeze when no freezes available', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 5,
        longestStreak: 10,
        lastActivityDate: new Date(),
        freezesUsed: 2,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockStreakRepository.findByUserId.mockResolvedValue(mockStreak);

      vi.spyOn(mockStreak, 'freeze').mockReturnValue(false);
      vi.spyOn(mockStreak, 'getFreezesAvailable').mockReturnValue(0);

      const result = await streakManager.freezeStreak('user-123');

      expect(result.success).toBe(false);
      expect(result.freezesRemaining).toBe(0);
      expect(mockStreakRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error for user without streak', async () => {
      mockStreakRepository.findByUserId.mockResolvedValue(null);

      await expect(streakManager.freezeStreak('user-123')).rejects.toThrow('Streak not found');
    });
  });

  describe('getStreakStatus', () => {
    it('should return complete streak status', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 7,
        longestStreak: 12,
        lastActivityDate: new Date(),
        freezesUsed: 1,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(null);
      mockStreakRepository.findByUserId.mockResolvedValue(mockStreak);
      mockCacheService.set.mockResolvedValue(undefined);

      vi.spyOn(mockStreak, 'getCurrentStreak').mockReturnValue(7);
      vi.spyOn(mockStreak, 'getNextMilestone').mockReturnValue(10);
      vi.spyOn(mockStreak, 'getDaysUntilMilestone').mockReturnValue(3);
      vi.spyOn(mockStreak, 'getFreezesAvailable').mockReturnValue(1);
      vi.spyOn(mockStreak, 'willExpireAt').mockReturnValue(new Date());
      vi.spyOn(mockStreak, 'toJSON').mockReturnValue({
        id: 'streak-123',
        userId: 'user-123',
        currentStreak: 7,
        longestStreak: 12,
        lastActivityDate: new Date(),
        freezesUsed: 1,
        weekendProtected: true,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await streakManager.getStreakStatus('user-123');

      expect(result).toMatchObject({
        currentStreak: 7,
        longestStreak: 12,
        status: 'ACTIVE',
        nextMilestone: 10,
        daysUntilMilestone: 3,
        freezesAvailable: 1,
        willExpireAt: expect.any(Date),
        lastActivityDate: expect.any(Date),
      });
    });

    it('should create and return new user streak status', async () => {
      const mockStreak = StreakEntity.create({
        userId: 'user-123',
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
      });

      mockCacheService.get.mockResolvedValue(null);
      mockStreakRepository.findByUserId.mockResolvedValue(null);
      mockStreakRepository.create.mockResolvedValue(undefined);
      mockCacheService.set.mockResolvedValue(undefined);

      vi.spyOn(StreakEntity, 'create').mockReturnValue(mockStreak);
      vi.spyOn(mockStreak, 'getCurrentStreak').mockReturnValue(0);
      vi.spyOn(mockStreak, 'getNextMilestone').mockReturnValue(3);
      vi.spyOn(mockStreak, 'getDaysUntilMilestone').mockReturnValue(3);
      vi.spyOn(mockStreak, 'getFreezesAvailable').mockReturnValue(2);
      vi.spyOn(mockStreak, 'willExpireAt').mockReturnValue(new Date());
      vi.spyOn(mockStreak, 'toJSON').mockReturnValue({
        id: 'streak-123',
        userId: 'user-123',
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: new Date(),
        freezesUsed: 0,
        weekendProtected: true,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await streakManager.getStreakStatus('user-123');

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.status).toBe('ACTIVE');
      expect(mockStreakRepository.create).toHaveBeenCalledWith(mockStreak);
    });
  });

  describe('processStreakReset', () => {
    it('should process streak reset for at-risk streaks', async () => {
      const mockStreaks = [
        StreakEntity.create({
          userId: 'user-1',
          currentStreak: 5,
          longestStreak: 10,
          lastActivityDate: new Date(Date.now() - 25 * 60 * 60 * 1000),
          freezesUsed: 0,
          weekendProtected: false,
          status: 'AT_RISK',
        }),
        StreakEntity.create({
          userId: 'user-2',
          currentStreak: 3,
          longestStreak: 8,
          lastActivityDate: new Date(Date.now() - 26 * 60 * 60 * 1000),
          freezesUsed: 1,
          weekendProtected: false,
          status: 'AT_RISK',
        }),
      ];

      mockStreakRepository.findStreaksAtRisk.mockResolvedValue(mockStreaks);
      mockStreakRepository.save.mockResolvedValue(undefined);
      mockCacheService.del.mockResolvedValue(undefined);

      mockStreaks.forEach(streak => {
        vi.spyOn(streak, 'markBroken').mockReturnValue(undefined);
        vi.spyOn(streak, 'getUserId').mockReturnValue(streak.toJSON().userId);
      });

      const result = await streakManager.processStreakReset();

      expect(result.processed).toBe(2);
      expect(result.broken).toBe(2);
      expect(mockStreakRepository.save).toHaveBeenCalledTimes(2);
      expect(mockCacheService.del).toHaveBeenCalledTimes(2);
    });

    it('should handle empty at-risk streaks', async () => {
      mockStreakRepository.findStreaksAtRisk.mockResolvedValue([]);

      const result = await streakManager.processStreakReset();

      expect(result.processed).toBe(0);
      expect(result.broken).toBe(0);
      expect(mockStreakRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle updateStreak errors gracefully', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      await expect(streakManager.updateStreak('user-123', {
        xpEarned: 50,
        timeSpent: 600,
        projectsCompleted: 1,
      })).rejects.toThrow('Cache error');
    });

    it('should handle freezeStreak errors gracefully', async () => {
      mockStreakRepository.findByUserId.mockRejectedValue(new Error('Database error'));

      await expect(streakManager.freezeStreak('user-123')).rejects.toThrow('Database error');
    });

    it('should handle processStreakReset errors gracefully', async () => {
      mockStreakRepository.findStreaksAtRisk.mockRejectedValue(new Error('Repository error'));

      await expect(streakManager.processStreakReset()).rejects.toThrow('Repository error');
    });
  });
});