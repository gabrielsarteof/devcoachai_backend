import { describe, it, expect, beforeEach } from 'vitest';
import { CopyPasteDetectorService } from '../../../src/modules/ai/infrastructure/services/copy-paste-detector.service';
import { createMockPrisma, createMockRedis } from '../../helpers/test-mocks';

describe('CopyPasteDetectorService', () => {
  let prisma: any;
  let redis: any;
  let detector: CopyPasteDetectorService;
  const testUserId = 'test-user-123';
  const testAttemptId = 'test-attempt-123';

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();

    // CORREÇÃO: Configure default mock returns to prevent undefined errors
    prisma.codeEvent.findMany.mockResolvedValue([]);
    prisma.codeEvent.createMany.mockResolvedValue({ count: 0 });

    // CORREÇÃO: Configure mocks para updateDependencyMetrics
    prisma.aIInteraction.findMany.mockResolvedValue([]);
    prisma.challengeAttempt.findUnique.mockResolvedValue({
      finalCode: 'const test = "mock code";'
    });

    detector = new CopyPasteDetectorService(prisma, redis);
  });

  describe('trackCopyPaste', () => {
    it('should track copy event', async () => {
      // Mock Redis operations for copy event
      redis.keys.mockResolvedValue(['copypaste:test-user-123:test-attempt-123:copy:1727351337000']);
      redis.get.mockResolvedValue(JSON.stringify({
        content: 'const hello = () => console.log("Hello");',
        lines: 1,
        timestamp: Date.now()
      }));
      redis.set.mockResolvedValue('OK');
      redis.setex.mockResolvedValue('OK');

      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'copy',
        content: 'const hello = () => console.log("Hello");',
        sourceLines: 1,
      });

      // Verify Redis operations were called appropriately
      expect(redis.setex).toHaveBeenCalled();
    });

    it('should detect paste of similar content', async () => {
      // Mock Redis for copy event first
      redis.setex.mockResolvedValue('OK');
      redis.keys.mockResolvedValue([]);

      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'copy',
        content: 'function test() { return 42; }',
        sourceLines: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Mock Redis for paste event - should find the previous copy
      redis.keys.mockResolvedValue(['copypaste:test-user-123:test-attempt-123:copy:1727351337000']);
      redis.get.mockResolvedValue(JSON.stringify({
        content: 'function test() { return 42; }',
        lines: 1,
        timestamp: Date.now() - 1000
      }));

      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'paste',
        content: 'function test() { return 42; }',
        targetLines: 1,
      });

      // Verify operations were called
      expect(redis.keys).toHaveBeenCalled();
      expect(redis.get).toHaveBeenCalled();
    });
  });

  describe('getCopyPasteStats', () => {
    it('should return copy/paste statistics', async () => {
      // Mock the database query instead of creating actual records
      prisma.codeEvent.findMany.mockResolvedValue([
        {
          attemptId: testAttemptId,
          userId: testUserId,
          type: 'PASTED',
          sessionTime: 100,
          linesAdded: 5,
          linesRemoved: 0,
          totalLines: 50,
          charactersChanged: 100,
          wasFromAI: true,
        },
        {
          attemptId: testAttemptId,
          userId: testUserId,
          type: 'PASTED',
          sessionTime: 200,
          linesAdded: 3,
          linesRemoved: 0,
          totalLines: 53,
          charactersChanged: 60,
          wasFromAI: false,
        },
      ]);

      const stats = await detector.getCopyPasteStats(testAttemptId);

      expect(stats.totalCopies).toBe(2);
      expect(stats.totalPastes).toBe(2);
      expect(stats.aiCopyRate).toBe(0.5);
    });
  });
});