import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import {
  rowToPaper,
  execResultToPaperRows,
  buildSearchPattern,
  createAbortControllerManager,
  loadEnabledTopicNames,
  filterByTopicIds,
} from '../paper-shared';

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
CREATE TABLE IF NOT EXISTS conference_paper_topics (
  paper_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  PRIMARY KEY (paper_id, topic_id)
);
`;

function createDb(): SqlJsDatabase {
  return new (globalThis as any).__testSQL.Database();
}

describe('execResultToPaperRows', () => {
  it('converts sql.js result to row objects', () => {
    const result = {
      columns: ['id', 'title', 'authors'],
      values: [
        ['1', 'Paper A', '["Alice"]'],
        ['2', 'Paper B', '["Bob", "Charlie"]'],
      ],
    };
    const rows = execResultToPaperRows(result);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: '1', title: 'Paper A', authors: '["Alice"]' });
    expect(rows[1]).toEqual({ id: '2', title: 'Paper B', authors: '["Bob", "Charlie"]' });
  });

  it('handles empty result', () => {
    const rows = execResultToPaperRows({ columns: ['id'], values: [] });
    expect(rows).toEqual([]);
  });

  it('handles columns with special characters in values', () => {
    const result = {
      columns: ['id', 'abstract_text'],
      values: [['1', 'This has "quotes" and new\nlines']],
    };
    const rows = execResultToPaperRows(result);
    expect(rows[0].abstract_text).toBe('This has "quotes" and new\nlines');
  });
});

describe('rowToPaper', () => {
  it('parses JSON authors and categories', () => {
    const row: Record<string, unknown> = {
      id: '1234.5678',
      title: 'Test Paper',
      authors: '["Alice", "Bob"]',
      abstract_text: 'Abstract',
      url: 'https://arxiv.org/abs/1234.5678',
      pdf_url: 'https://arxiv.org/pdf/1234.5678.pdf',
      published_date: '2024-03-15',
      updated_date: '2024-03-15',
      categories: '["cs.AI", "cs.LG"]',
      fetched_at: '2024-03-15',
    };
    const paper = rowToPaper(row);
    expect(paper.authors).toEqual(['Alice', 'Bob']);
    expect(paper.categories).toEqual(['cs.AI', 'cs.LG']);
  });

  it('handles empty arrays', () => {
    const row: Record<string, unknown> = {
      id: '1',
      title: 'T',
      authors: '[]',
      abstract_text: '',
      url: '',
      pdf_url: '',
      published_date: '',
      updated_date: '',
      categories: '[]',
      fetched_at: '',
    };
    const paper = rowToPaper(row);
    expect(paper.authors).toEqual([]);
    expect(paper.categories).toEqual([]);
  });
});

describe('buildSearchPattern', () => {
  it('wraps plain text with wildcards', () => {
    expect(buildSearchPattern('hello')).toBe('%hello%');
  });

  it('escapes percent signs', () => {
    expect(buildSearchPattern('50%')).toBe('%50\\%%');
  });

  it('escapes underscores', () => {
    expect(buildSearchPattern('a_b')).toBe('%a\\_b%');
  });

  it('escapes backslashes', () => {
    expect(buildSearchPattern('a\\b')).toBe('%a\\\\b%');
  });

  it('handles empty string', () => {
    expect(buildSearchPattern('')).toBe('%%');
  });
});

describe('createAbortControllerManager', () => {
  it('returns null before set', () => {
    const mgr = createAbortControllerManager();
    expect(mgr.get()).toBeNull();
  });

  it('returns controller after set', () => {
    const mgr = createAbortControllerManager();
    const ctrl = new AbortController();
    mgr.set(ctrl);
    expect(mgr.get()).toBe(ctrl);
  });

  it('aborts and clears controller on stop', () => {
    const mgr = createAbortControllerManager();
    const ctrl = new AbortController();
    mgr.set(ctrl);
    const result = mgr.stop();
    expect(result.success).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
    expect(mgr.get()).toBeNull();
  });

  it('returns success when no controller is set', () => {
    const mgr = createAbortControllerManager();
    const result = mgr.stop();
    expect(result.success).toBe(true);
  });
});

describe('loadEnabledTopicNames', () => {
  let topicsDb: SqlJsDatabase;

  beforeAll(async () => {
    const SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  beforeEach(() => {
    topicsDb = createDb();
    topicsDb.run(TOPICS_SCHEMA);
  });

  it('returns empty array when no topics exist', () => {
    expect(loadEnabledTopicNames(topicsDb)).toEqual([]);
  });

  it('returns names of enabled topics', () => {
    topicsDb.run("INSERT INTO topics (name, keywords, enabled) VALUES ('AI', '[\"ai\"]', 1)");
    topicsDb.run("INSERT INTO topics (name, keywords, enabled) VALUES ('CV', '[\"cv\"]', 1)");
    expect(loadEnabledTopicNames(topicsDb)).toEqual(['AI', 'CV']);
  });

  it('excludes disabled topics', () => {
    topicsDb.run("INSERT INTO topics (name, keywords, enabled) VALUES ('AI', '[\"ai\"]', 1)");
    topicsDb.run("INSERT INTO topics (name, keywords, enabled) VALUES ('CV', '[\"cv\"]', 0)");
    expect(loadEnabledTopicNames(topicsDb)).toEqual(['AI']);
  });
});

describe('filterByTopicIds', () => {
  let topicsDb: SqlJsDatabase;

  beforeAll(async () => {
    const SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  beforeEach(() => {
    topicsDb = createDb();
    topicsDb.run(TOPICS_SCHEMA);
    topicsDb.run("INSERT INTO topics (name, keywords, enabled) VALUES ('AI', '[\"ai\"]', 1)");
    topicsDb.run("INSERT INTO arxiv_paper_topics VALUES ('paper1', 1)");
    topicsDb.run("INSERT INTO conference_paper_topics VALUES ('conf1', 1)");
  });

  it('does nothing when topicIds is empty', () => {
    const conditions: string[] = [];
    const bindValues: unknown[] = [];
    filterByTopicIds(topicsDb, 'arxiv_paper_topics', [], conditions, bindValues);
    expect(conditions).toEqual([]);
    expect(bindValues).toEqual([]);
  });

  it('adds paper ID condition for matching topics', () => {
    const conditions: string[] = [];
    const bindValues: unknown[] = [];
    filterByTopicIds(topicsDb, 'arxiv_paper_topics', [1], conditions, bindValues);
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain('p.id IN');
    expect(bindValues).toEqual(['paper1']);
  });

  it('adds impossible condition when no papers match', () => {
    const conditions: string[] = [];
    const bindValues: unknown[] = [];
    filterByTopicIds(topicsDb, 'arxiv_paper_topics', [999], conditions, bindValues);
    expect(conditions).toEqual(['1 = 0']);
    expect(bindValues).toEqual([]);
  });

  it('uses correct junction table', () => {
    const conditions: string[] = [];
    const bindValues: unknown[] = [];
    filterByTopicIds(topicsDb, 'conference_paper_topics', [1], conditions, bindValues);
    expect(bindValues).toEqual(['conf1']);
  });
});
