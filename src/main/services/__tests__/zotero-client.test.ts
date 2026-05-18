import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock fs/promises for connectorSaveAttachment
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

// Mock PDF downloader
vi.mock('../pdf-extractor.js', () => ({
  ensurePdfDownloaded: vi.fn(),
}));

import {
  pingZotero,
  getConnectorCollections,
  connectorSaveItems,
  connectorUpdateSession,
  connectorSaveAttachment,
  parseCreators,
  buildNotes,
  exportToZotero,
  type ConnectorItem,
} from '../zotero-client.js';
import { ensurePdfDownloaded } from '../pdf-extractor.js';

const mockedDownload = vi.mocked(ensurePdfDownloaded);

// ── Connector API ──

describe('pingZotero', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns true when Zotero is running', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    expect(await pingZotero()).toBe(true);
  });

  it('returns false when Zotero is not running', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await pingZotero()).toBe(false);
  });

  it('returns false on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    expect(await pingZotero()).toBe(false);
  });
});

describe('getConnectorCollections', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches and filters collection targets', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        targets: [
          { id: 'L1', name: 'My Library', level: 0 },
          { id: 'C21', name: 'Inbox', level: 1 },
          { id: 'C6', name: '2D Computer Vision', level: 1 },
        ],
      }),
    });

    const result = await getConnectorCollections();
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('C21');
    expect(result[1].key).toBe('C6');
  });

  it('returns empty array when no collections', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ targets: [{ id: 'L1', name: 'My Library' }] }),
    });
    expect(await getConnectorCollections()).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' });
    await expect(getConnectorCollections()).rejects.toThrow('HTTP 500');
  });
});

describe('connectorSaveItems', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('sends saveItems request', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await connectorSaveItems('sess', 'https://arxiv.org/abs/2401', [{
      id: 'item_0', itemType: 'preprint', title: 'Test', creators: [],
      tags: [], notes: [], attachments: [], seeAlso: [],
    }]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sessionID).toBe('sess');
    expect(body.singleFile).toBe(false);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' });
    await expect(connectorSaveItems('s', 'u', [{
      id: 'i', itemType: 'preprint', title: 'T', creators: [],
      tags: [], notes: [], attachments: [], seeAlso: [],
    }])).rejects.toThrow('HTTP 500');
  });
});

describe('connectorUpdateSession', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('sends target as string', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await connectorUpdateSession('sess', 'C21');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target).toBe('C21');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'ERR' });
    await expect(connectorUpdateSession('bad', 'C21')).rejects.toThrow('HTTP 400');
  });
});

describe('connectorSaveAttachment', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('sends PDF data with X-Metadata', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await connectorSaveAttachment('s', 'item_0', '/p.pdf', 'PDF', 'url');
    const metadata = JSON.parse(mockFetch.mock.calls[0][1].headers['X-Metadata']);
    expect(metadata.parentItemID).toBe('item_0');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'ERR' });
    await expect(connectorSaveAttachment('s', 'i', '/p.pdf', 'PDF', 'url')).rejects.toThrow('HTTP 400');
  });
});

// ── Export helpers ──

describe('parseCreators', () => {
  it('parses single name as lastName only', () => {
    expect(parseCreators(['Einstein'])).toEqual([
      { creatorType: 'author', firstName: '', lastName: 'Einstein' },
    ]);
  });

  it('parses two-part name', () => {
    expect(parseCreators(['Alan Turing'])).toEqual([
      { creatorType: 'author', firstName: 'Alan', lastName: 'Turing' },
    ]);
  });

  it('parses multi-part name', () => {
    expect(parseCreators(['John von Neumann'])).toEqual([
      { creatorType: 'author', firstName: 'John von', lastName: 'Neumann' },
    ]);
  });

  it('handles empty array', () => {
    expect(parseCreators([])).toEqual([]);
  });

  it('handles multiple authors', () => {
    const result = parseCreators(['Ada Lovelace', 'Alan Turing']);
    expect(result).toHaveLength(2);
    expect(result[0].lastName).toBe('Lovelace');
    expect(result[1].lastName).toBe('Turing');
  });
});

describe('buildNotes', () => {
  it('returns empty array when no content', () => {
    expect(buildNotes()).toEqual([]);
  });

  it('builds summary note', () => {
    expect(buildNotes('<p>Summary</p>')).toEqual([
      '<h1>论文总结</h1><p>Summary</p>',
    ]);
  });

  it('builds both notes', () => {
    expect(buildNotes('<p>S</p>', '<p>A</p>')).toEqual([
      '<h1>论文总结</h1><p>S</p>',
      '<h1>论文分析</h1><p>A</p>',
    ]);
  });
});

describe('exportToZotero', () => {
  const baseItem: ConnectorItem = {
    id: 'item_0', itemType: 'preprint', title: 'Test',
    url: 'https://arxiv.org/abs/2401', creators: [],
    tags: [], notes: [], attachments: [], seeAlso: [],
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockedDownload.mockReset();
  });

  it('returns full success when all steps succeed', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    mockedDownload.mockResolvedValue('/tmp/paper.pdf');

    const result = await exportToZotero(
      baseItem, 'https://arxiv.org/pdf/2401', 'arXiv', '2401', 'C21', '/data',
    );

    expect(result).toEqual({ success: true, collectionMoved: true, pdfAttached: true });
    expect(mockedDownload).toHaveBeenCalledWith(
      'https://arxiv.org/pdf/2401', undefined, '/data', 'arXiv', '2401',
    );
  });

  it('returns collectionMoved=false when updateSession fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: true });
    mockedDownload.mockResolvedValue('/tmp/paper.pdf');

    const result = await exportToZotero(
      baseItem, 'https://arxiv.org/pdf/2401', 'arXiv', '2401', 'C21', '/data',
    );

    expect(result).toEqual({ success: true, collectionMoved: false, pdfAttached: true });
  });

  it('returns pdfAttached=false when PDF download fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    mockedDownload.mockRejectedValue(new Error('network error'));

    const result = await exportToZotero(
      baseItem, 'https://arxiv.org/pdf/2401', 'arXiv', '2401', 'C21', '/data',
    );

    expect(result).toEqual({ success: true, collectionMoved: true, pdfAttached: false });
  });

  it('returns pdfAttached=false when saveAttachment fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' });
    mockedDownload.mockResolvedValue('/tmp/paper.pdf');

    const result = await exportToZotero(
      baseItem, 'https://arxiv.org/pdf/2401', 'arXiv', '2401', 'C21', '/data',
    );

    expect(result).toEqual({ success: true, collectionMoved: true, pdfAttached: false });
  });

  it('skips PDF when no pdfUrl', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const result = await exportToZotero(baseItem, '', 'arXiv', '2401', 'C21', '/data');

    expect(result).toEqual({ success: true, collectionMoved: true, pdfAttached: false });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it('throws when saveItems fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' });

    await expect(
      exportToZotero(baseItem, '', 'arXiv', '2401', 'C21', '/data'),
    ).rejects.toThrow('saveItems');
  });
});
