import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock all dependencies before importing stores
const mockToastShow = vi.fn();
vi.mock('../toast', () => ({
  useToastStore: () => ({ show: mockToastShow, remove: vi.fn() }),
}));

vi.mock('../../utils/format', () => ({
  truncate: (s: string) => s,
  extractErrorMessage: (err: unknown) => String(err),
}));

// Mock papers store
const mockRefreshStatus = vi.fn().mockResolvedValue(undefined);
vi.mock('../papers', () => ({
  usePapersStore: () => ({
    refreshStatus: mockRefreshStatus,
    contentVersion: 0,
  }),
}));

// Mock conference-papers store
const mockConfRefreshStatus = vi.fn().mockResolvedValue(undefined);
vi.mock('../conference-papers', () => ({
  useConferencePapersStore: () => ({
    refreshStatus: mockConfRefreshStatus,
    contentVersion: 0,
  }),
}));

// Mock progress store
vi.mock('../progress', () => ({
  useProgressStore: () => ({
    isAnalyzing: false,
    progressPhase: '',
    progressCurrent: 0,
    progressTotal: 0,
    currentPaper: '',
    lastError: '',
  }),
}));

// Mock window.api
const mockSummarizeArxiv = vi.fn().mockResolvedValue({ success: true });
const mockSummarizeConference = vi.fn().mockResolvedValue({ success: true });
const mockStopArxivSummary = vi.fn().mockResolvedValue({ success: true });
const mockStopConferenceSummary = vi.fn().mockResolvedValue({ success: true });

vi.stubGlobal('window', {
  api: {
    summarizeArxivPaper: mockSummarizeArxiv,
    conferenceSummarizePaper: mockSummarizeConference,
    stopArxivSummary: mockStopArxivSummary,
    conferenceStopSummary: mockStopConferenceSummary,
  },
});

import { useSummaryQueueStore } from '../summaryQueue';

describe('useSummaryQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty queue', () => {
      const store = useSummaryQueueStore();
      expect(store.queue).toEqual([]);
      expect(store.isRunning).toBe(false);
      expect(store.completedCount).toBe(0);
      expect(store.errorCount).toBe(0);
    });
  });

  describe('enqueue', () => {
    it('adds items to queue', () => {
      const store = useSummaryQueueStore();
      const added = store.enqueue([
        { id: '1', title: 'Paper A' },
        { id: '2', title: 'Paper B' },
      ]);
      expect(added).toBe(2);
    });

    it('deduplicates items', () => {
      const store = useSummaryQueueStore();
      store.enqueue([{ id: '1', title: 'Paper A' }]);
      const added = store.enqueue([
        { id: '1', title: 'Paper A' },
        { id: '2', title: 'Paper B' },
      ]);
      expect(added).toBe(1);
    });
  });

  describe('isInQueue', () => {
    it('returns true for enqueued paper', () => {
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);
      expect(store.isInQueue('p1')).toBe(true);
    });

    it('returns false for unknown paper', () => {
      const store = useSummaryQueueStore();
      expect(store.isInQueue('unknown')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears the queue', () => {
      const store = useSummaryQueueStore();
      store.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      store.clear();
      expect(store.queue).toEqual([]);
    });
  });

  describe('remove', () => {
    it('removes item from queue', () => {
      const store = useSummaryQueueStore();
      store.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      store.remove('1');
      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].id).toBe('2');
    });
  });

  describe('processing', () => {
    it('calls arxiv summarize for non-conference papers', async () => {
      mockSummarizeArxiv.mockResolvedValueOnce({ success: true });
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test Paper' }]);

      // Wait for async processing
      await vi.waitFor(() => expect(store.isRunning).toBe(false));

      expect(mockSummarizeArxiv).toHaveBeenCalledWith('p1', false);
    });

    it('calls conference summarize for conference papers', async () => {
      mockSummarizeConference.mockResolvedValueOnce({ success: true });
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'cp1', title: 'Conf Paper', conference: true }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));

      expect(mockSummarizeConference).toHaveBeenCalledWith('cp1', false);
    });

    it('increments completedCount on success', async () => {
      mockSummarizeArxiv.mockResolvedValueOnce({ success: true });
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.completedCount).toBe(1));
    });

    it('shows toast on completion', async () => {
      mockSummarizeArxiv.mockResolvedValueOnce({ success: true });
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(mockToastShow).toHaveBeenCalled());

      expect(mockToastShow).toHaveBeenCalledWith('总结完成', 'Test', 'success');
    });

    it('increments errorCount on failure', async () => {
      mockSummarizeArxiv.mockRejectedValueOnce(new Error('API error'));
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.errorCount).toBe(1));
    });

    it('handles cancelled result', async () => {
      mockSummarizeArxiv.mockResolvedValueOnce({ success: false, cancelled: true });
      const store = useSummaryQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));
      expect(store.completedCount).toBe(0);
    });
  });

  describe('updateProgress', () => {
    it('can be called directly', () => {
      const store = useSummaryQueueStore();
      store.updateProgress();
      // Should not throw
    });
  });
});
