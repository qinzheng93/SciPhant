import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import * as fsSync from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

function readMigration(filename: string): string {
  return fsSync.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

function runMultiStatement(db: SqlJsDatabase, sql: string): void {
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    db.run(stmt);
  }
}

describe('Database migrations', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
  });

  describe('001_initial.sql', () => {
    it('creates papers and categories tables', () => {
      const db = new SQL.Database();
      runMultiStatement(db, readMigration('001_initial.sql'));

      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      const names = tables[0].values.flat() as string[];
      expect(names).toContain('papers');
      expect(names).toContain('categories');

      // Verify key columns exist
      const paperCols = db.exec('PRAGMA table_info(papers)');
      const colNames = paperCols[0].values.map(r => r[1] as string);
      expect(colNames).toContain('id');
      expect(colNames).toContain('title');
      expect(colNames).toContain('abstract');
      expect(colNames).toContain('updated_date');

      db.close();
    });

    it('is idempotent', () => {
      const db = new SQL.Database();
      runMultiStatement(db, readMigration('001_initial.sql'));
      // Run again — IF NOT EXISTS should prevent errors
      runMultiStatement(db, readMigration('001_initial.sql'));
      // Verify single table
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='papers'");
      expect(tables[0].values).toHaveLength(1);
      db.close();
    });
  });

  describe('002_rename_abstract.sql', () => {
    it('renames abstract_text column to abstract', () => {
      const db = new SQL.Database();
      // Create table with old schema
      db.run(`CREATE TABLE papers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        abstract_text TEXT NOT NULL,
        url TEXT NOT NULL
      )`);
      db.run("INSERT INTO papers (id, title, abstract_text, url) VALUES ('p1', 'T', 'A', 'U')");

      // Apply migration
      runMultiStatement(db, readMigration('002_rename_abstract.sql'));

      // Verify column was renamed
      const cols = db.exec('PRAGMA table_info(papers)');
      const colNames = cols[0].values.map(r => r[1] as string);
      expect(colNames).toContain('abstract');
      expect(colNames).not.toContain('abstract_text');

      // Data preserved
      const rows = db.exec('SELECT abstract FROM papers WHERE id = ?', ['p1']);
      expect(rows[0].values[0][0]).toBe('A');

      db.close();
    });
  });

  describe('003_conference.sql', () => {
    it('creates conferences and papers tables with indexes', () => {
      const db = new SQL.Database();
      runMultiStatement(db, readMigration('003_conference.sql'));

      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      const names = tables[0].values.flat() as string[];
      expect(names).toContain('conferences');
      expect(names).toContain('papers');

      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");
      const indexNames = indexes[0].values.flat() as string[];
      expect(indexNames).toContain('idx_papers_conference');
      expect(indexNames).toContain('idx_papers_title');

      db.close();
    });
  });

  describe('migration tracking', () => {
    it('tracks applied migrations correctly', () => {
      const db = new SQL.Database();
      // Create tracking table (mimics Database class)
      db.run(`CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);

      // Apply 001
      runMultiStatement(db, readMigration('001_initial.sql'));
      db.run('INSERT INTO _migrations (name) VALUES (?)', ['001_initial']);

      // Check it's tracked
      const rows = db.exec('SELECT name FROM _migrations');
      expect(rows[0].values).toHaveLength(1);

      // Skip re-applying (mimics idempotency check)
      const already = db.exec('SELECT 1 FROM _migrations WHERE name = ?', ['001_initial']);
      expect(already.length).toBeGreaterThan(0);

      db.close();
    });
  });
});
