import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import { join } from 'path';

vi.mock('../connection.js', async () => {
  const initSqlJs = (await import('sql.js')).default;
  return {
    getSqlJs: () => initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }),
  };
});

import { PaperTopicsDb } from '../paper-topics.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(os.tmpdir(), `topics-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('PaperTopicsDb', () => {
  it('creates all required tables on init', async () => {
    const dbPath = join(tmpDir, 'topics.db');
    const pt = new PaperTopicsDb(dbPath);
    await pt.init();

    const tables = pt.getDb().exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tables[0].values.flat() as string[];
    expect(tableNames).toContain('topics');
    expect(tableNames).toContain('arxiv_paper_topics');
    expect(tableNames).toContain('conference_paper_topics');

    await pt.close();
  });

  it('creates indexes on junction tables', async () => {
    const dbPath = join(tmpDir, 'topics.db');
    const pt = new PaperTopicsDb(dbPath);
    await pt.init();

    const indexes = pt.getDb().exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");
    const indexNames = indexes[0].values.flat() as string[];
    expect(indexNames).toContain('idx_arxiv_pt_tid');
    expect(indexNames).toContain('idx_conf_pt_tid');

    await pt.close();
  });

  it('is idempotent — second init preserves data', async () => {
    const dbPath = join(tmpDir, 'topics.db');
    const pt = new PaperTopicsDb(dbPath);
    await pt.init();

    pt.getDb().run("INSERT INTO topics (name, keywords, enabled) VALUES ('AI', '[\"ai\"]', 1)");
    await pt.close();

    const pt2 = new PaperTopicsDb(dbPath);
    await pt2.init();

    const rows = pt2.getDb().exec('SELECT name FROM topics');
    expect(rows[0].values).toHaveLength(1);
    expect(rows[0].values[0][0]).toBe('AI');

    await pt2.close();
  });

  it('persists data to disk on close', async () => {
    const dbPath = join(tmpDir, 'topics.db');
    const pt = new PaperTopicsDb(dbPath);
    await pt.init();
    await pt.close();

    expect(fsSync.existsSync(dbPath)).toBe(true);
  });

  it('throws getDb before init', () => {
    const pt = new PaperTopicsDb(join(tmpDir, 'noop.db'));
    expect(() => pt.getDb()).toThrow('not initialized');
  });
});
