import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { CopyPasteDetectorService } from '../../../src/modules/ai/infrastructure/services/copy-paste-detector.service';

describe('CopyPasteDetectorService', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let detector: CopyPasteDetectorService;
  const testUserId = 'test-user-123';
  const testAttemptId = 'test-attempt-123';

  beforeEach(async () => {
    prisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_TEST_URL || process.env.DATABASE_URL,
    });
    
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 2,
    });
    
    await redis.flushdb();
    
    detector = new CopyPasteDetectorService(prisma, redis);
  });

  describe('trackCopyPaste', () => {
    it('should track copy event', async () => {
      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'copy',
        content: 'const hello = () => console.log("Hello");',
        sourceLines: 1,
      });

      const key = `copypaste:${testUserId}:${testAttemptId}:copy:*`;
      const keys = await redis.keys(key);
      
      expect(keys.length).toBe(1);
      
      const data = await redis.get(keys[0]);
      expect(data).toBeTruthy();
      
      const parsed = JSON.parse(data!);
      expect(parsed.content).toBe('const hello = () => console.log("Hello");');
      expect(parsed.lines).toBe(1);
    });

    it('should detect paste of similar content', async () => {
      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'copy',
        content: 'function test() { return 42; }',
        sourceLines: 1,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await detector.trackCopyPaste(testUserId, {
        attemptId: testAttemptId,
        action: 'paste',
        content: 'function test() { return 42; }', 
        targetLines: 1,
      });

    });
  });

  describe('getCopyPasteStats', () => {
    it('should return copy/paste statistics', async () => {
      await prisma.codeEvent.createMany({
        data: [
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
        ],
      });

      const stats = await detector.getCopyPasteStats(testAttemptId);
      
      expect(stats.totalCopies).toBe(2);
      expect(stats.totalPastes).toBe(2);
      expect(stats.aiCopyRate).toBe(0.5); 
    });
  });
});