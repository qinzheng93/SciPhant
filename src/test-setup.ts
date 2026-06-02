import { vi } from 'vitest';

// Mock electron modules so tests don't require the binary to be installed
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test'),
    getVersion: vi.fn(() => '0.0.0'),
  },
  BrowserWindow: vi.fn(),
  net: {
    fetch: vi.fn(),
  },
}));
