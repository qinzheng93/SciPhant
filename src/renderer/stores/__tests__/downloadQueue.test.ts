import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock toast store
vi.mock('../toast', () => ({
  useToastStore: () => ({
    show: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock('../../utils/format', () => ({
  truncate: (s: string) => s,
  extractErrorMessage: (err: unknown) => String(err),
}));

// Mock window.api to prevent actual IPC calls
vi.stubGlobal('window', {
  api: {
    isArxivPdfCached: vi.fn().mockResolvedValue(true),
    conferenceIsPdfCached: vi.fn().mockResolvedValue(true),
    downloadArxivPdf: vi.fn().mockResolvedValue(''),
    conferenceDownloadPdf: vi.fn().mockResolvedValue(''),
    onPdfDownloadProgress: vi.fn(() => vi.fn()),
  },
});

import { useDownloadQueueStore } from '../downloadQueue';

describe('useDownloadQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('isInQueue', () => {
    it('returns false for unknown paper', () => {
      const store = useDownloadQueueStore();
      expect(store.isInQueue('paper1')).toBe(false);
    });

    it('returns true for queued paper', () => {
      const store = useDownloadQueueStore();
      store.enqueue([{ id: 'paper1', title: 'Test' }]);
      expect(store.isInQueue('paper1')).toBe(true);
    });
  });

  describe('enqueue', () => {
    it('adds items to queue', () => {
      const store = useDownloadQueueStore();
      const added = store.enqueue([
        { id: 'p1', title: 'Paper 1' },
        { id: 'p2', title: 'Paper 2' },
      ]);
      expect(added).toBe(2);
      expect(store.isInQueue('p1')).toBe(true);
      expect(store.isInQueue('p2')).toBe(true);
    });

    it('skips duplicates', () => {
      const store = useDownloadQueueStore();
      store.enqueue([{ id: 'p1', title: 'Paper 1' }]);
      const added = store.enqueue([{ id: 'p1', title: 'Paper 1' }]);
      expect(added).toBe(0);
    });

    it('handles mixed duplicate and new items', () => {
      const store = useDownloadQueueStore();
      store.enqueue([{ id: 'p1', title: 'Paper 1' }]);
      const added = store.enqueue([
        { id: 'p1', title: 'Paper 1' },
        { id: 'p2', title: 'Paper 2' },
      ]);
      expect(added).toBe(1);
      expect(store.isInQueue('p2')).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes item from queue', async () => {
      const store = useDownloadQueueStore();
      // Block processing by making download hang
      vi.mocked(window.api.downloadArxivPdf).mockReturnValue(new Promise(() => {}));
      store.enqueue([{ id: 'p1', title: 'Paper 1' }]);
      // Wait for processing to start
      await vi.waitFor(() => expect(store.isRunning).toBe(true));
      // Enqueue second item (won't process until first finishes)
      store.enqueue([{ id: 'p2', title: 'Paper 2' }]);
      store.remove('p2');
      expect(store.isInQueue('p2')).toBe(false);
    });

    it('does nothing for non-existent item', () => {
      const store = useDownloadQueueStore();
      expect(() => store.remove('unknown')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('empties the queue', () => {
      const store = useDownloadQueueStore();
      store.enqueue([
        { id: 'p1', title: 'Paper 1' },
        { id: 'p2', title: 'Paper 2' },
      ]);
      store.clear();
      expect(store.queue).toHaveLength(0);
    });
  });

  describe('waitForDownload', () => {
    it('resolves immediately if already cached', async () => {
      const store = useDownloadQueueStore();
      vi.mocked(window.api.isArxivPdfCached).mockResolvedValue(true);

      const result = await store.waitForDownload('p1');
      expect(result).toBe('p1');
    });

    it('uses conference API for conference items', async () => {
      const store = useDownloadQueueStore();
      vi.mocked(window.api.conferenceIsPdfCached).mockResolvedValue(true);

      store.enqueue([{ id: 'p1', title: 'Test', conference: true }]);
      await store.waitForDownload('p1');
      expect(window.api.conferenceIsPdfCached).toHaveBeenCalledWith('p1');
    });
  });
});
