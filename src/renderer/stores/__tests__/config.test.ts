import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock API before importing store
vi.mock('../../api', () => ({
  listTopics: vi.fn(),
  saveTopic: vi.fn(),
  deleteTopic: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  listCategories: vi.fn(),
  saveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  rebuildPaperTopics: vi.fn(),
}));

import { useConfigStore } from '../config';
import {
  listTopics,
  saveTopic,
  deleteTopic as apiDeleteTopic,
  getConfig,
  listCategories,
  saveCategory as apiSaveCategory,
  deleteCategory as apiDeleteCategory,
} from '../../api';

const mockedListTopics = vi.mocked(listTopics);
const mockedSaveTopic = vi.mocked(saveTopic);
const mockedDeleteTopic = vi.mocked(apiDeleteTopic);
const mockedGetConfig = vi.mocked(getConfig);
const mockedListCategories = vi.mocked(listCategories);
const mockedSaveCategory = vi.mocked(apiSaveCategory);
const mockedDeleteCategory = vi.mocked(apiDeleteCategory);

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Prevent auto-load from interfering
    mockedListTopics.mockResolvedValue([]);
    mockedListCategories.mockResolvedValue([]);
    mockedGetConfig.mockResolvedValue({
      llm: { api_key: '', base_url: '', model: '', temperature: 1.0 },
      output: { output_dir: '', auto_save: false },
    });
  });

  describe('loadTopics', () => {
    it('updates topics state', async () => {
      const fakeTopics = [
        { id: 1, name: 'AI', keywords: ['ai'], enabled: true },
      ];
      mockedListTopics.mockResolvedValue(fakeTopics);
      const store = useConfigStore();
      await store.loadTopics();
      expect(store.topics).toEqual(fakeTopics);
    });

    it('handles error gracefully', async () => {
      mockedListTopics.mockRejectedValue(new Error('fail'));
      const store = useConfigStore();
      await store.loadTopics();
      expect(store.topics).toEqual([]);
    });
  });

  describe('loadCategories', () => {
    it('updates categories state', async () => {
      const fakeCats = [
        { id: 1, name: 'cs.AI', enabled: true },
      ];
      mockedListCategories.mockResolvedValue(fakeCats);
      const store = useConfigStore();
      await store.loadCategories();
      expect(store.categories).toEqual(fakeCats);
    });
  });

  describe('loadConfig', () => {
    it('updates llmConfig and theme', async () => {
      mockedGetConfig.mockResolvedValue({
        llm: { api_key: 'sk-test', base_url: 'https://api.test.com', model: 'gpt-4', temperature: 0.7 },
        output: { output_dir: '/tmp', auto_save: true },
        theme: 'dark',
      });
      const store = useConfigStore();
      await store.loadConfig();
      expect(store.llmConfig.api_key).toBe('sk-test');
      expect(store.llmConfig.temperature).toBe(0.7);
      expect(store.theme).toBe('dark');
    });
  });

  describe('addTopic', () => {
    it('refreshes topics on success', async () => {
      mockedSaveTopic.mockResolvedValue({ id: 1, name: 'AI', keywords: ['ai'], enabled: true });
      mockedListTopics.mockResolvedValue([{ id: 1, name: 'AI', keywords: ['ai'], enabled: true }]);
      const store = useConfigStore();
      const result = await store.addTopic({ name: 'AI', keywords: ['ai'], enabled: true });
      expect(result).toBe(true);
      expect(store.topics).toHaveLength(1);
    });

    it('returns false on API error', async () => {
      mockedSaveTopic.mockResolvedValue({ error: 'duplicate' });
      const store = useConfigStore();
      const result = await store.addTopic({ name: 'AI', keywords: ['ai'], enabled: true });
      expect(result).toBe(false);
    });
  });

  describe('deleteTopic', () => {
    it('refreshes topics after delete', async () => {
      mockedListTopics.mockResolvedValue([]);
      const store = useConfigStore();
      await store.deleteTopic(1);
      expect(mockedDeleteTopic).toHaveBeenCalledWith(1);
      expect(mockedListTopics).toHaveBeenCalled();
    });
  });

  describe('addCategory', () => {
    it('refreshes categories after add', async () => {
      mockedSaveCategory.mockResolvedValue({ id: 1, name: 'cs.AI', enabled: true });
      mockedListCategories.mockResolvedValue([{ id: 1, name: 'cs.AI', enabled: true }]);
      const store = useConfigStore();
      await store.addCategory('cs.AI');
      expect(mockedSaveCategory).toHaveBeenCalledWith({ name: 'cs.AI', enabled: true });
      expect(store.categories).toHaveLength(1);
    });
  });

  describe('deleteCategory', () => {
    it('refreshes categories after delete', async () => {
      mockedListCategories.mockResolvedValue([]);
      const store = useConfigStore();
      await store.deleteCategory(1);
      expect(mockedDeleteCategory).toHaveBeenCalledWith(1);
      expect(store.categories).toHaveLength(0);
    });
  });
});
