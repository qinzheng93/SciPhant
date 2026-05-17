import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import {
  validateConferenceSchema,
  hasSchemaIssues,
  listSourceConferences,
  findConflicts,
  backupConferenceDb,
  restoreConferenceDb,
  removeBackup,
} from '../conference-import.js';

import * as fs from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const CONFERENCE_SCHEMA = `
CREATE TABLE conferences (
  id INTEGER PRIMARY KEY,
  short_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  full_name TEXT,
  location TEXT,
  published_date TEXT,
  UNIQUE(short_name, year)
);
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  title TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '[]',
  abstract TEXT,
  pdf_url TEXT,
  supp_url TEXT,
  arxiv_url TEXT,
  bibtex TEXT,
  pages TEXT,
  track TEXT,
  detail_url TEXT
);
`;

function createDb(): SqlJsDatabase {
  return new (globalThis as any).__testSQL.Database();
}

function seedConference(
  db: SqlJsDatabase,
  id: number,
  shortName: string,
  year: number,
  fullName: string | null = null,
) {
  db.run('INSERT INTO conferences (id, short_name, year, full_name) VALUES (?, ?, ?, ?)', [
    id, shortName, year, fullName,
  ]);
}

function seedPaper(
  db: SqlJsDatabase,
  id: string,
  conferenceId: number,
  title: string,
) {
  db.run(
    'INSERT INTO papers (id, conference_id, title, authors, abstract) VALUES (?, ?, ?, ?, ?)',
    [id, conferenceId, title, '[]', ''],
  );
}

describe('conference-import', () => {
  beforeAll(async () => {
    const SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  // ── validateConferenceSchema ──

  describe('validateConferenceSchema', () => {
    it('passes for valid schema', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      const issues = validateConferenceSchema(db);
      expect(issues.missingTables).toEqual([]);
      expect(issues.missingColumns).toEqual([]);
    });

    it('reports missing conferences table', () => {
      const db = createDb();
      // only papers table
      db.run(`CREATE TABLE papers (id TEXT PRIMARY KEY)`);
      const issues = validateConferenceSchema(db);
      expect(issues.missingTables).toEqual(['conferences']);
    });

    it('reports missing papers table', () => {
      const db = createDb();
      db.run(`CREATE TABLE conferences (id INTEGER PRIMARY KEY, short_name TEXT)`);
      const issues = validateConferenceSchema(db);
      expect(issues.missingTables).toEqual(['papers']);
    });

    it('reports both missing tables', () => {
      const db = createDb();
      const issues = validateConferenceSchema(db);
      expect(issues.missingTables).toHaveLength(2);
      expect(issues.missingTables).toContain('conferences');
      expect(issues.missingTables).toContain('papers');
    });

    it('reports missing columns in conferences', () => {
      const db = createDb();
      db.run('CREATE TABLE conferences (id INTEGER PRIMARY KEY, short_name TEXT NOT NULL, year INTEGER NOT NULL)');
      db.run('CREATE TABLE papers (id TEXT PRIMARY KEY, conference_id INTEGER, title TEXT, authors TEXT, abstract TEXT)');
      const issues = validateConferenceSchema(db);
      expect(issues.missingColumns).toEqual([{ table: 'conferences', column: 'full_name' }]);
    });

    it('reports extra columns', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      db.run('ALTER TABLE conferences ADD COLUMN extra_col TEXT');
      const issues = validateConferenceSchema(db);
      expect(issues.extraColumns).toEqual([{ table: 'conferences', column: 'extra_col' }]);
    });

    it('reports missing columns in papers', () => {
      const db = createDb();
      db.run(`CREATE TABLE conferences (id INTEGER PRIMARY KEY, short_name TEXT NOT NULL, year INTEGER NOT NULL, full_name TEXT, location TEXT, published_date TEXT)`);
      db.run(`CREATE TABLE papers (id TEXT PRIMARY KEY, conference_id INTEGER, title TEXT)`);
      const issues = validateConferenceSchema(db);
      expect(issues.missingColumns).toContainEqual({ table: 'papers', column: 'authors' });
      expect(issues.missingColumns).toContainEqual({ table: 'papers', column: 'abstract' });
    });

    it('reports both missing tables and missing columns together', () => {
      const db = createDb();
      db.run(`CREATE TABLE conferences (id INTEGER PRIMARY KEY)`);
      // papers missing entirely, conferences missing columns
      const issues = validateConferenceSchema(db);
      expect(issues.missingTables).toEqual(['papers']);
      expect(issues.missingColumns.length).toBeGreaterThan(0);
    });
  });

  // ── hasSchemaIssues ──

  describe('hasSchemaIssues', () => {
    it('returns false for clean schema', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      expect(hasSchemaIssues(validateConferenceSchema(db))).toBe(false);
    });

    it('returns true when tables are missing', () => {
      const db = createDb();
      expect(hasSchemaIssues(validateConferenceSchema(db))).toBe(true);
    });

    it('returns true when columns are missing', () => {
      const db = createDb();
      db.run(`CREATE TABLE conferences (id INTEGER PRIMARY KEY, short_name TEXT, year INTEGER, full_name TEXT, location TEXT, published_date TEXT)`);
      db.run(`CREATE TABLE papers (id TEXT PRIMARY KEY, conference_id INTEGER, title TEXT, authors TEXT, abstract TEXT)`);
      // This should pass — no missing required columns
      expect(hasSchemaIssues(validateConferenceSchema(db))).toBe(false);
    });
  });

  // ── listSourceConferences ──

  describe('listSourceConferences', () => {
    it('returns empty array for empty database', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      expect(listSourceConferences(db)).toEqual([]);
    });

    it('lists conferences with paper counts', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      seedConference(db, 1, 'CVPR', 2025, 'CVPR 2025');
      seedConference(db, 2, 'ICLR', 2025, 'ICLR 2025');
      seedPaper(db, 'p1', 1, 'Paper A');
      seedPaper(db, 'p2', 1, 'Paper B');
      seedPaper(db, 'p3', 2, 'Paper C');

      const result = listSourceConferences(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, short_name: 'CVPR', year: 2025, full_name: 'CVPR 2025', paper_count: 2 });
      expect(result[1]).toEqual({ id: 2, short_name: 'ICLR', year: 2025, full_name: 'ICLR 2025', paper_count: 1 });
    });

    it('shows zero paper count for conference with no papers', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      seedConference(db, 1, 'CVPR', 2025);
      const result = listSourceConferences(db);
      expect(result[0].paper_count).toBe(0);
    });

    it('orders by year DESC then short_name', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      seedConference(db, 1, 'AAAI', 2024);
      seedConference(db, 2, 'CVPR', 2025);
      seedConference(db, 3, 'AAAI', 2025);
      const result = listSourceConferences(db);
      expect(result.map(r => `${r.short_name}${r.year}`)).toEqual(['AAAI2025', 'CVPR2025', 'AAAI2024']);
    });

    it('handles null full_name', () => {
      const db = createDb();
      db.run(CONFERENCE_SCHEMA);
      seedConference(db, 1, 'CVPR', 2025, null);
      const result = listSourceConferences(db);
      expect(result[0].full_name).toBeNull();
    });
  });

  // ── findConflicts ──

  describe('findConflicts', () => {
    let sourceDb: SqlJsDatabase;
    let targetDb: SqlJsDatabase;

    beforeEach(() => {
      sourceDb = createDb();
      sourceDb.run(CONFERENCE_SCHEMA);
      targetDb = createDb();
      targetDb.run(CONFERENCE_SCHEMA);
    });

    it('returns empty when no conflicts', () => {
      seedConference(sourceDb, 1, 'CVPR', 2025);
      seedConference(targetDb, 1, 'ICLR', 2025);
      const sourceConfs = listSourceConferences(sourceDb);
      const conflicts = findConflicts(targetDb, sourceConfs);
      expect(conflicts).toEqual([]);
    });

    it('detects conflict by short_name + year', () => {
      seedConference(sourceDb, 1, 'CVPR', 2025);
      seedPaper(sourceDb, 'sp1', 1, 'Source Paper');
      seedConference(targetDb, 10, 'CVPR', 2025);
      seedPaper(targetDb, 'tp1', 10, 'Target Paper');

      const sourceConfs = listSourceConferences(sourceDb);
      const conflicts = findConflicts(targetDb, sourceConfs);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].source.short_name).toBe('CVPR');
      expect(conflicts[0].source.paper_count).toBe(1);
      expect(conflicts[0].targetPaperCount).toBe(1);
    });

    it('same short_name different year is not a conflict', () => {
      seedConference(sourceDb, 1, 'CVPR', 2025);
      seedConference(targetDb, 1, 'CVPR', 2024);
      const sourceConfs = listSourceConferences(sourceDb);
      expect(findConflicts(targetDb, sourceConfs)).toEqual([]);
    });

    it('reports target paper count as 0 for conference with no papers', () => {
      seedConference(sourceDb, 1, 'CVPR', 2025);
      seedConference(targetDb, 10, 'CVPR', 2025);
      // target has no papers

      const sourceConfs = listSourceConferences(sourceDb);
      const conflicts = findConflicts(targetDb, sourceConfs);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].targetPaperCount).toBe(0);
    });

    it('detects multiple conflicts', () => {
      seedConference(sourceDb, 1, 'CVPR', 2025);
      seedConference(sourceDb, 2, 'ICLR', 2025);
      seedConference(targetDb, 10, 'CVPR', 2025);
      seedConference(targetDb, 20, 'ICLR', 2025);

      const sourceConfs = listSourceConferences(sourceDb);
      expect(findConflicts(targetDb, sourceConfs)).toHaveLength(2);
    });
  });

  // ── backupConferenceDb / restoreConferenceDb / removeBackup ──

  describe('backup and restore', () => {
    const testDir = join(tmpdir(), `blueberry-test-${Date.now()}`);

    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    it('creates backup file', async () => {
      const dbPath = join(testDir, 'test.db');
      await fs.writeFile(dbPath, 'test-data');
      const backupPath = await backupConferenceDb(dbPath);
      expect(backupPath).toBe(dbPath + '.backup');
      const content = await fs.readFile(backupPath, 'utf-8');
      expect(content).toBe('test-data');
    });

    it('restores from backup', async () => {
      const dbPath = join(testDir, 'test.db');
      const backupPath = dbPath + '.backup';
      await fs.writeFile(dbPath, 'new-data');
      await fs.writeFile(backupPath, 'old-data');
      await restoreConferenceDb(backupPath, dbPath);
      const content = await fs.readFile(dbPath, 'utf-8');
      expect(content).toBe('old-data');
    });

    it('removes backup file', async () => {
      const backupPath = join(testDir, 'test.db.backup');
      await fs.writeFile(backupPath, 'data');
      await removeBackup(backupPath);
      await expect(fs.access(backupPath)).rejects.toThrow();
    });

    it('removeBackup does not throw if file does not exist', async () => {
      const backupPath = join(testDir, 'nonexistent.backup');
      await expect(removeBackup(backupPath)).resolves.toBeUndefined();
    });

    // Clean up
    afterAll(async () => {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });
  });
});
