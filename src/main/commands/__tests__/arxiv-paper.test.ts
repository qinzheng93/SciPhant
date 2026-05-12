import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import { listArxivPapers, listArxivFetchDates } from '../arxiv-paper';

const SCHEMA = `
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
  name TEXT NOT NULL UNIQUE,
  keywords TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS arxiv_paper_topics (
  paper_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  PRIMARY KEY (paper_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_arxiv_pt_tid ON arxiv_paper_topics(topic_id, paper_id);
`;

function insertPaper(db: SqlJsDatabase, id: string, title: string, updatedDate: string) {
  db.run(
    `INSERT INTO papers (id, title, authors, abstract_text, url, pdf_url, published_date, updated_date, categories, fetched_at)
     VALUES (?, ?, '[]', '', '', '', ?, ?, '[]', ?)`,
    [id, title, updatedDate, updatedDate, updatedDate],
  );
}

function setupTopicDb(): SqlJsDatabase {
  const ptDb = new (globalThis as any).__testSQL.Database();
  ptDb.run(TOPICS_SCHEMA);
  return ptDb;
}

describe('listArxivPapers', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeAll(async () => {
    SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  beforeEach(() => {
    db = new SQL.Database();
    db.run(SCHEMA);
  });

  it('returns empty result for no papers', () => {
    const result = listArxivPapers(db, null, {});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  it('paginates results', () => {
    for (let i = 1; i <= 5; i++) {
      insertPaper(db, `${i}`, `Paper ${i}`, '2024-03-10');
    }
    const page1 = listArxivPapers(db, null, { page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);

    const page2 = listArxivPapers(db, null, { page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.page).toBe(2);

    const page3 = listArxivPapers(db, null, { page: 3, pageSize: 2 });
    expect(page3.items).toHaveLength(1);
  });

  it('filters by search query on title', () => {
    insertPaper(db, '1', 'Machine Learning Advances', '2024-03-10');
    insertPaper(db, '2', 'Biology Study', '2024-03-10');
    insertPaper(db, '3', 'Deep Learning Methods', '2024-03-10');
    const result = listArxivPapers(db, null, { search: 'learning' });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('filters by search query on abstract', () => {
    insertPaper(db, '1', 'Paper A', '2024-03-10');
    db.run("UPDATE papers SET abstract_text = 'This is about neural networks' WHERE id = '1'");
    insertPaper(db, '2', 'Paper B', '2024-03-10');
    const result = listArxivPapers(db, null, { search: 'neural' });
    expect(result.items).toHaveLength(1);
  });

  it('filters by fetch date', () => {
    insertPaper(db, '1', 'Old Paper', '2024-03-10');
    insertPaper(db, '2', 'New Paper', '2024-03-15');
    const result = listArxivPapers(db, null, { fetchDate: '2024-03-10' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('1');
  });

  it('filters by topic via junction table', () => {
    const ptDb = setupTopicDb();
    ptDb.run("INSERT INTO topics VALUES (1, 'AI', '[]', 1)");
    ptDb.run("INSERT INTO arxiv_paper_topics VALUES ('1', 1)");
    insertPaper(db, '1', 'AI Paper', '2024-03-10');
    insertPaper(db, '2', 'Bio Paper', '2024-03-10');
    const result = listArxivPapers(db, ptDb, { topicId: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('1');
  });

  it('returns no results when topic filter matches nothing', () => {
    const ptDb = setupTopicDb();
    ptDb.run("INSERT INTO topics VALUES (1, 'AI', '[]', 1)");
    insertPaper(db, '1', 'Paper', '2024-03-10');
    const result = listArxivPapers(db, ptDb, { topicId: 1 });
    expect(result.items).toHaveLength(0);
  });

  it('orders by updated_date DESC', () => {
    insertPaper(db, '1', 'Old', '2024-03-01');
    insertPaper(db, '2', 'New', '2024-03-15');
    const result = listArxivPapers(db, null, {});
    expect(result.items[0].id).toBe('2');
    expect(result.items[1].id).toBe('1');
  });

  it('clamps page_size to [1, 100]', () => {
    insertPaper(db, '1', 'Paper', '2024-03-10');
    expect(listArxivPapers(db, null, { pageSize: 0 }).page_size).toBe(1);
    expect(listArxivPapers(db, null, { pageSize: 200 }).page_size).toBe(100);
  });

  it('defaults page to 1', () => {
    expect(listArxivPapers(db, null, { page: undefined }).page).toBe(1);
    expect(listArxivPapers(db, null, { page: -1 }).page).toBe(1);
  });

  it('handles special characters in search', () => {
    insertPaper(db, '1', 'Paper with % symbol', '2024-03-10');
    const result = listArxivPapers(db, null, { search: '% symbol' });
    expect(result.items).toHaveLength(1);
  });

  it('returns papers with no summary status', () => {
    insertPaper(db, '1', 'Paper A', '2024-03-10');
    const result = listArxivPapers(db, null, {});
    expect(result.items[0].id).toBe('1');
  });
});

describe('listArxivFetchDates', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeAll(async () => {
    SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  beforeEach(() => {
    db = new SQL.Database();
    db.run(SCHEMA);
  });

  it('returns empty for no papers', () => {
    expect(listArxivFetchDates(db)).toEqual([]);
  });

  it('groups papers by date and counts', () => {
    insertPaper(db, '1', 'A', '2024-03-10');
    insertPaper(db, '2', 'B', '2024-03-10');
    insertPaper(db, '3', 'C', '2024-03-15');
    const dates = listArxivFetchDates(db);
    expect(dates).toHaveLength(2);
    // Ordered DESC
    expect(dates[0].date).toBe('2024-03-15');
    expect(dates[0].count).toBe(1);
    expect(dates[1].date).toBe('2024-03-10');
    expect(dates[1].count).toBe(2);
  });

  it('formats display date', () => {
    insertPaper(db, '1', 'A', '2024-03-10');
    const dates = listArxivFetchDates(db);
    expect(dates[0].display).toBe('2024年3月10日');
  });
});
