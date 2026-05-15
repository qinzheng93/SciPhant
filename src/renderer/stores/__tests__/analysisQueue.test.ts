import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock toast store
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

// Mock download queue store
const mockWaitForDownload = vi.fn().mockResolvedValue(undefined);
vi.mock('../downloadQueue', () => ({
  useDownloadQueueStore: () => ({
    waitForDownload: mockWaitForDownload,
  }),
}));

// Mock window.api
const mockAnalyzeArxiv = vi.fn().mockResolvedValue({ success: true });
const mockAnalyzeConference = vi.fn().mockResolvedValue({ success: true });
const mockStopArxivAnalysis = vi.fn().mockResolvedValue({ success: true });
const mockStopConferenceAnalysis = vi.fn().mockResolvedValue({ success: true });
const mockOnAnalysisProgress = vi.fn(() => vi.fn());

vi.stubGlobal('window', {
  api: {
    analyzeArxivFullPaper: mockAnalyzeArxiv,
    conferenceAnalyzeFullPaper: mockAnalyzeConference,
    stopArxivAnalysis: mockStopArxivAnalysis,
    conferenceStopAnalysis: mockStopConferenceAnalysis,
    onAnalysisProgress: mockOnAnalysisProgress,
  },
});

import { useAnalysisQueueStore } from '../analysisQueue';

describe('useAnalysisQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty queue', () => {
      const store = useAnalysisQueueStore();
      expect(store.queue).toEqual([]);
      expect(store.isRunning).toBe(false);
      expect(store.completedCount).toBe(0);
      expect(store.errorCount).toBe(0);
      expect(store.progressPhase).toBe('');
    });
  });

  describe('enqueue', () => {
    it('adds items to queue', () => {
      const store = useAnalysisQueueStore();
      const added = store.enqueue([
        { id: '1', title: 'Paper A' },
        { id: '2', title: 'Paper B' },
      ]);
      expect(added).toBe(2);
    });

    it('deduplicates items', () => {
      const store = useAnalysisQueueStore();
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
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);
      expect(store.isInQueue('p1')).toBe(true);
    });

    it('returns false for unknown paper', () => {
      const store = useAnalysisQueueStore();
      expect(store.isInQueue('unknown')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears the queue', () => {
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      store.clear();
      expect(store.queue).toEqual([]);
    });
  });

  describe('remove', () => {
    it('removes item from queue', () => {
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      store.remove('1');
      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].id).toBe('2');
    });
  });

  describe('processing', () => {
    it('waits for download then analyzes arxiv paper', async () => {
      mockAnalyzeArxiv.mockResolvedValueOnce({ success: true });
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test Paper' }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));

      expect(mockWaitForDownload).toHaveBeenCalledWith('p1');
      expect(mockAnalyzeArxiv).toHaveBeenCalledWith('p1');
    });

    it('analyzes conference paper', async () => {
      mockAnalyzeConference.mockResolvedValueOnce({ success: true });
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'cp1', title: 'Conf Paper', conference: true }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));

      expect(mockAnalyzeConference).toHaveBeenCalledWith('cp1');
    });

    it('increments completedCount on success', async () => {
      mockAnalyzeArxiv.mockResolvedValueOnce({ success: true });
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.completedCount).toBe(1));
    });

    it('shows toast on completion', async () => {
      mockAnalyzeArxiv.mockResolvedValueOnce({ success: true });
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(mockToastShow).toHaveBeenCalled());

      expect(mockToastShow).toHaveBeenCalledWith('分析完成', 'Test', 'success');
    });

    it('increments errorCount on failure', async () => {
      mockAnalyzeArxiv.mockRejectedValueOnce(new Error('API error'));
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.errorCount).toBe(1));
    });

    it('handles cancelled result', async () => {
      mockAnalyzeArxiv.mockResolvedValueOnce({ success: false, cancelled: true });
      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));
      expect(store.completedCount).toBe(0);
    });

    it('registers and unregisters progress listener', async () => {
      const offFn = vi.fn();
      mockOnAnalysisProgress.mockReturnValueOnce(offFn);
      mockAnalyzeArxiv.mockResolvedValueOnce({ success: true });

      const store = useAnalysisQueueStore();
      store.enqueue([{ id: 'p1', title: 'Test' }]);

      await vi.waitFor(() => expect(store.isRunning).toBe(false));

      expect(mockOnAnalysisProgress).toHaveBeenCalled();
      expect(offFn).toHaveBeenCalled();
    });
  });
});
