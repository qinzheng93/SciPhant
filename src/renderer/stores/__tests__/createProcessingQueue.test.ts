import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProcessingQueue } from '../createProcessingQueue';

// Mock toast store to prevent Pinia errors
vi.mock('../toast', () => ({
  useToastStore: () => ({ show: vi.fn(), remove: vi.fn() }),
}));

describe('createProcessingQueue', () => {
  let queue: ReturnType<typeof createProcessingQueue>;

  beforeEach(() => {
    queue = createProcessingQueue({
      name: 'test',
      processItem: vi.fn().mockResolvedValue(undefined),
      stopApi: vi.fn().mockResolvedValue({ success: true }),
    });
    // Prevent auto-start of processQueue
    queue.isRunning.value = true;
  });

  describe('enqueue', () => {
    it('adds items to queue', () => {
      const added = queue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      expect(added).toBe(2);
      expect(queue.queue.value).toHaveLength(2);
    });

    it('deduplicates items already in queue', () => {
      queue.enqueue([{ id: '1', title: 'A' }]);
      const added = queue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      expect(added).toBe(1);
      expect(queue.queue.value).toHaveLength(2);
    });

    it('deduplicates currently processing item', () => {
      queue.currentItem.value = { id: '1', title: 'A' };
      queue.currentPaperId.value = '1';
      const added = queue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      expect(added).toBe(1);
      expect(queue.queue.value).toHaveLength(1);
      expect(queue.queue.value[0].id).toBe('2');
    });

    it('returns number of added items', () => {
      expect(queue.enqueue([{ id: '1', title: 'A' }])).toBe(1);
    });
  });

  describe('isInQueue', () => {
    it('returns true for item in queue', () => {
      queue.enqueue([{ id: '1', title: 'A' }]);
      expect(queue.isInQueue('1')).toBe(true);
    });

    it('returns true for currently processing item', () => {
      queue.currentItem.value = { id: '1', title: 'A' };
      queue.currentPaperId.value = '1';
      expect(queue.isInQueue('1')).toBe(true);
    });

    it('returns false for unknown item', () => {
      expect(queue.isInQueue('999')).toBe(false);
    });
  });

  describe('remove', () => {
    it('removes item from queue', () => {
      queue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      queue.remove('1');
      expect(queue.queue.value).toHaveLength(1);
      expect(queue.queue.value[0].id).toBe('2');
    });
  });

  describe('clear', () => {
    it('clears queue and sets stopRequested', () => {
      queue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      queue.clear();
      expect(queue.queue.value).toHaveLength(0);
      expect(queue.stopRequested.value).toBe(true);
    });
  });

  describe('processQueue', () => {
    it('processes all items in order', async () => {
      const order: string[] = [];
      const testQueue = createProcessingQueue({
        name: 'test',
        processItem: async (item) => {
          order.push(item.id);
        },
        stopApi: vi.fn().mockResolvedValue({ success: true }),
      });
      testQueue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }, { id: '3', title: 'C' }]);
      await vi.waitFor(() => expect(order).toEqual(['1', '2', '3']));
      expect(testQueue.completedCount.value).toBe(3);
    });

    it('sets currentPaperId during processing', async () => {
      const idsDuringProcessing: (string | null)[] = [];
      const testQueue = createProcessingQueue({
        name: 'test',
        processItem: async () => {
          idsDuringProcessing.push(testQueue.currentPaperId.value);
        },
        stopApi: vi.fn().mockResolvedValue({ success: true }),
      });
      testQueue.enqueue([{ id: '1', title: 'A' }]);
      await vi.waitFor(() => expect(testQueue.currentPaperId.value).toBeNull());
      expect(idsDuringProcessing).toContain('1');
    });

    it('increments errorCount on failure', async () => {
      const testQueue = createProcessingQueue({
        name: 'test',
        processItem: vi.fn().mockRejectedValue(new Error('fail')),
        stopApi: vi.fn().mockResolvedValue({ success: true }),
      });
      testQueue.enqueue([{ id: '1', title: 'A' }]);
      await vi.waitFor(() => expect(testQueue.errorCount.value).toBe(1));
    });

    it('does not duplicate processing when called while running', async () => {
      const processItem = vi.fn().mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 10));
      });
      const testQueue = createProcessingQueue({
        name: 'test',
        processItem,
        stopApi: vi.fn().mockResolvedValue({ success: true }),
      });
      testQueue.enqueue([{ id: '1', title: 'A' }]);
      // Call processQueue again while running — should be a no-op
      await testQueue.processQueue();
      expect(processItem).toHaveBeenCalledTimes(1);
    });

    it('stops when stopRequested is set', async () => {
      const testQueue = createProcessingQueue({
        name: 'test',
        processItem: async () => {
          testQueue.stopRequested.value = true;
        },
        stopApi: vi.fn().mockResolvedValue({ success: true }),
      });
      testQueue.enqueue([{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
      await vi.waitFor(() => expect(testQueue.completedCount.value).toBe(1));
    });
  });
});
