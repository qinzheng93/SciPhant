import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchCollections, createItem, createChildItems } from '../zotero-client.js';

describe('fetchCollections', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches and maps collections', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'ABC123', data: { name: 'My Collection' }, meta: { numItems: 5 } },
      ],
    });

    const result = await fetchCollections('12345', 'test-key');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('ABC123');
    expect(result[0].name).toBe('My Collection');
    expect(result[0].numItems).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.zotero.org/users/12345/collections?limit=100',
      expect.objectContaining({ headers: { 'Zotero-API-Key': 'test-key' } }),
    );
  });

  it('handles 403 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(fetchCollections('12345', 'bad-key')).rejects.toThrow('API Key 无权限');
  });

  it('handles 404 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    await expect(fetchCollections('99999', 'key')).rejects.toThrow('用户不存在');
  });

  it('handles other HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    });

    await expect(fetchCollections('12345', 'key')).rejects.toThrow('HTTP 500');
  });

  it('handles empty response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await fetchCollections('12345', 'test-key');
    expect(result).toEqual([]);
  });

  it('handles null response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const result = await fetchCollections('12345', 'test-key');
    expect(result).toEqual([]);
  });

  it('defaults numItems to 0 when meta is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'K1', data: { name: 'No Meta' } },
      ],
    });

    const result = await fetchCollections('12345', 'test-key');
    expect(result[0].numItems).toBe(0);
  });

  it('defaults name to empty string when data.name is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'K1', data: {}, meta: { numItems: 0 } },
      ],
    });

    const result = await fetchCollections('12345', 'test-key');
    expect(result[0].name).toBe('');
  });
});

describe('createItem', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates item and returns key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        successful: { '0': 'NEWKEY123' },
        success: { '0': 'NEWKEY123' },
        failed: {},
      }),
    });

    const payload = {
      itemType: 'journalArticle',
      title: 'Test Paper',
      abstractNote: 'Abstract',
      date: '2024',
      url: 'https://arxiv.org/abs/2401.00001',
      extra: '',
      repository: 'arXiv',
      archiveID: '2401.00001',
      creators: [{ creatorType: 'author', firstName: 'John', lastName: 'Doe' }],
      tags: [{ tag: 'AI' }],
      collections: [],
    };

    const key = await createItem('12345', 'api-key', 'COLL1', payload);
    expect(key).toBe('NEWKEY123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.zotero.org/users/12345/items',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Zotero-API-Key': 'api-key',
          'Content-Type': 'application/json',
        },
      }),
    );

    // Verify collectionKey was added
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody[0].collections).toEqual(['COLL1']);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(createItem('12345', 'bad', 'C1', {} as any)).rejects.toThrow('API Key 无权限');
  });

  it('throws when no items were successfully created', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        successful: {},
        failed: { '0': { message: 'Invalid data' } },
      }),
    });

    await expect(createItem('12345', 'key', 'C1', {} as any)).rejects.toThrow('条目创建失败');
  });

  it('handles successful item returned as object', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        successful: { '0': { key: 'OBJKEY' } },
        success: { '0': { key: 'OBJKEY' } },
        failed: {},
      }),
    });

    const key = await createItem('12345', 'key', 'C1', {} as any);
    expect(key).toBe('OBJKEY');
  });
});

describe('createChildItems', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates child items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        successful: { '0': 'CHILD1', '1': 'CHILD2' },
        success: { '0': 'CHILD1', '1': 'CHILD2' },
        failed: {},
      }),
    });

    const children = [
      { itemType: 'attachment', parentItem: 'P1', linkMode: 'imported_file', title: 'PDF' },
      { itemType: 'note', parentItem: 'P1', note: '<p>Notes</p>' },
    ];

    await createChildItems('12345', 'key', children as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.zotero.org/users/12345/items',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('skips when children array is empty', async () => {
    await createChildItems('12345', 'key', []);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    await expect(
      createChildItems('12345', 'key', [{ itemType: 'note', parentItem: 'P1' }] as any),
    ).rejects.toThrow('用户不存在');
  });
});
