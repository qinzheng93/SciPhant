import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';

const PAPERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  abstract_text TEXT NOT NULL,
  url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  published_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  categories TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

const TOPICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS arxiv_paper_topics (
  paper_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  PRIMARY KEY (paper_id, topic_id)
);
`;

// Mock net-fetch to avoid real network calls
vi.mock('../../services/net-fetch', () => ({
  netFetch: vi.fn(),
}));

// Mock rebuildArxivPaperTopics
vi.mock('../rebuild-arxiv-topics', () => ({
  rebuildArxivPaperTopics: vi.fn(),
}));

import { netFetch } from '../../services/net-fetch.js';
import { rebuildArxivPaperTopics } from '../rebuild-arxiv-topics.js';
import { fetchArxivPapersByIds } from '../arxiv-fetch.js';

const mockedNetFetch = vi.mocked(netFetch);
const mockedRebuild = vi.mocked(rebuildArxivPaperTopics);

function makeAtomXml(entries: { id: string; title: string; summary: string; authors: string[]; published: string; updated: string; categories: string[] }[]): string {
  const entriesXml = entries.map(e => `
<entry>
  <id>http://arxiv.org/abs/${e.id}</id>
  <title>${e.title}</title>
  <summary>${e.summary}</summary>
  ${e.authors.map(a => `<author><name>${a}</name></author>`).join('\n  ')}
  <published>${e.published}</published>
  <updated>${e.updated}</updated>
  ${e.categories.map(c => `<category term="${c}"/>`).join('\n  ')}
  <link href="http://arxiv.org/abs/${e.id}" rel="alternate" type="text/html"/>
  <link href="http://arxiv.org/pdf/${e.id}" rel="related" type="application/pdf"/>
</entry>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entriesXml}</feed>`;
}

describe('fetchArxivPapersByIds', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createDbs() {
    const db = new SQL.Database();
    db.run(PAPERS_SCHEMA);
    const topicDb = new SQL.Database();
    topicDb.run(TOPICS_SCHEMA);
    return { db, topicDb };
  }

  it('returns error when input cannot be parsed', async () => {
    const { db, topicDb } = createDbs();
    const result = await fetchArxivPapersByIds(db, topicDb, 'invalid, also-bad');

    expect(result.success).toBe(false);
    expect(result.fetched).toHaveLength(0);
    expect(result.errors[0]).toContain('无法解析');
    expect(mockedNetFetch).not.toHaveBeenCalled();
  });

  it('fetches a single paper by bare ID', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'Test Paper', summary: 'Abstract', authors: ['Alice'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001');

    expect(result.success).toBe(true);
    expect(result.fetched).toHaveLength(1);
    expect(result.fetched[0].id).toBe('2301.00001');
    expect(result.fetched[0].title).toBe('Test Paper');
    expect(result.existing).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockedRebuild).toHaveBeenCalledTimes(1);
  });

  it('fetches a paper from URL input', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00002', title: 'URL Paper', summary: 'Abs', authors: ['Bob'], published: '2024-01-02T00:00:00Z', updated: '2024-01-02T00:00:00Z', categories: ['cs.LG'] },
      ])),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, 'https://arxiv.org/abs/2301.00002');

    expect(result.success).toBe(true);
    expect(result.fetched[0].id).toBe('2301.00002');
  });

  it('strips version suffix from input', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00003', title: 'Versioned Paper', summary: 'Abs', authors: ['Carol'], published: '2024-01-03T00:00:00Z', updated: '2024-01-03T00:00:00Z', categories: ['cs.CV'] },
      ])),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00003v2');

    // The API URL should use the ID without version
    expect(mockedNetFetch).toHaveBeenCalledWith(
      expect.stringContaining('id_list=2301.00003'),
      expect.anything(),
    );
    expect(result.fetched[0].id).toBe('2301.00003');
  });

  it('fetches multiple papers separated by comma', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'Paper 1', summary: 'A1', authors: ['A'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });
    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00002', title: 'Paper 2', summary: 'A2', authors: ['B'], published: '2024-01-02T00:00:00Z', updated: '2024-01-02T00:00:00Z', categories: ['cs.LG'] },
      ])),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001, 2301.00002');

    expect(result.fetched).toHaveLength(2);
    expect(result.existing).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockedRebuild).toHaveBeenCalledTimes(1);
  });

  it('deduplicates duplicate IDs in input', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'Paper 1', summary: 'A1', authors: ['A'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001, 2301.00001');

    expect(mockedNetFetch).toHaveBeenCalledTimes(1);
    expect(result.fetched).toHaveLength(1);
  });

  it('counts existing papers', async () => {
    const { db, topicDb } = createDbs();

    // First fetch succeeds
    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'Existing Paper', summary: 'A', authors: ['A'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });

    // Fetch same paper again
    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'Existing Paper', summary: 'A', authors: ['A'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });

    await fetchArxivPapersByIds(db, topicDb, '2301.00001');
    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001');

    expect(result.fetched).toHaveLength(0);
    expect(result.existing).toBe(1);
    expect(result.success).toBe(false);
    expect(mockedRebuild).toHaveBeenCalledTimes(1); // only first call
  });

  it('handles paper not found', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'),
      statusCode: 200,
    });

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.99999');

    expect(result.success).toBe(false);
    expect(result.fetched).toHaveLength(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('未找到');
  });

  it('handles network error', async () => {
    const { db, topicDb } = createDbs();

    mockedNetFetch.mockRejectedValueOnce(new Error('网络连接失败'));

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001');

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('网络连接失败');
  });

  it('handles mixed results (success + existing + failed)', async () => {
    const { db, topicDb } = createDbs();

    // First paper: success
    mockedNetFetch.mockResolvedValueOnce({
      body: Buffer.from(makeAtomXml([
        { id: '2301.00001', title: 'New Paper', summary: 'A', authors: ['A'], published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z', categories: ['cs.AI'] },
      ])),
      statusCode: 200,
    });
    // Second paper: network error
    mockedNetFetch.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001, 2301.00002');

    expect(result.fetched).toHaveLength(1);
    expect(result.failed).toBe(1);
    expect(result.success).toBe(true);
    expect(mockedRebuild).toHaveBeenCalledTimes(1);
  });

  it('rejects input with any unparseable items', async () => {
    const { db, topicDb } = createDbs();

    const result = await fetchArxivPapersByIds(db, topicDb, '2301.00001, not-an-id');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('无法解析');
    expect(result.errors[0]).toContain('not-an-id');
    expect(mockedNetFetch).not.toHaveBeenCalled();
  });
});
