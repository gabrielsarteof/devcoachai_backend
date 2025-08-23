import { config } from 'dotenv';
import { vi } from 'vitest';

config({ path: '.env.test' });

vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    randomUUID: vi.fn(() => `test-uuid-${Date.now()}`),
  };
});