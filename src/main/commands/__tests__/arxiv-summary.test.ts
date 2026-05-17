import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';

vi.mock('../../services/analysis-files.js', () => ({
  writeAnalysisFile: vi.fn(),
  readAnalysisFile: vi.fn(),
  listExistingPaperIds: vi.fn(),
}));

vi.mock('../paper-shared.js', () => ({
  createAbortControllerManager: vi.fn(() => ({
    set: vi.fn(),
    stop: vi.fn(() => ({ success: true })),
    get: vi.fn(() => null),
  })),
  summarizePaperCore: vi.fn(),
}));

import {
  checkArxivSummaryStatus,
  getArxivSummaryContent,
  stopArxivSummary,
  setArxivSummaryAbortController,
  summarizeArxivPaper,
  ARXIV_CATEGORY,
} from '../arxiv-summary.js';
import { listExistingPaperIds, readAnalysisFile } from '../../services/analysis-files.js';
import { summarizePaperCore } from '../paper-shared.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  abstract TEXT NOT NULL,
  url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  published_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  categories TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

function insertPaper(
  db: SqlJsDatabase,
  id: string,
  title: string,
  abstractText: string,
) {
  db.run(
    `INSERT INTO papers (id, title, authors, abstract, url, pdf_url, published_date, updated_date, categories, fetched_at)
     VALUES (?, ?, '[]', ?, '', '', '2024-01-01', '2024-01-01', '[]', '2024-01-01')`,
    [id, title, abstractText],
  );
}

describe('arxiv-summary', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let settingsDb: SqlJsDatabase;
  let paperTopicsDb: SqlJsDatabase;

  beforeAll(async () => {
    SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
    (globalThis as any).__testSQL = SQL;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db = new SQL.Database();
    db.run(SCHEMA);
    settingsDb = new SQL.Database();
    paperTopicsDb = new SQL.Database();
  });

  describe('ARXIV_CATEGORY', () => {
    it('exports arXiv as the category constant', () => {
      expect(ARXIV_CATEGORY).toBe('arXiv');
    });
  });

  describe('checkArxivSummaryStatus', () => {
    it('returns empty object for empty paperIds', async () => {
      const result = await checkArxivSummaryStatus('/data', []);
      expect(result).toEqual({});
      expect(listExistingPaperIds).not.toHaveBeenCalled();
    });

    it('returns true for papers that have summaries', async () => {
      vi.mocked(listExistingPaperIds).mockResolvedValue(new Set(['p1', 'p3']));
      const result = await checkArxivSummaryStatus('/data', ['p1', 'p2', 'p3']);
      expect(result).toEqual({ p1: true, p2: false, p3: true });
      expect(listExistingPaperIds).toHaveBeenCalledWith('/data', 'summaries', 'arXiv');
    });

    it('returns all false when no summaries exist', async () => {
      vi.mocked(listExistingPaperIds).mockResolvedValue(new Set());
      const result = await checkArxivSummaryStatus('/data', ['p1', 'p2']);
      expect(result).toEqual({ p1: false, p2: false });
    });
  });

  describe('getArxivSummaryContent', () => {
    it('delegates to readAnalysisFile with correct args', async () => {
      vi.mocked(readAnalysisFile).mockResolvedValue('# Summary content');
      const result = await getArxivSummaryContent('/data', 'p1');
      expect(result).toBe('# Summary content');
      expect(readAnalysisFile).toHaveBeenCalledWith('/data', 'summaries', 'arXiv', 'p1');
    });

    it('returns null when file does not exist', async () => {
      vi.mocked(readAnalysisFile).mockResolvedValue(null);
      const result = await getArxivSummaryContent('/data', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('stopArxivSummary', () => {
    it('returns success object', () => {
      const result = stopArxivSummary();
      expect(result).toEqual({ success: true });
    });
  });

  describe('setArxivSummaryAbortController', () => {
    it('accepts an AbortController without throwing', () => {
      const ctrl = new AbortController();
      expect(() => setArxivSummaryAbortController(ctrl)).not.toThrow();
    });

    it('accepts null without throwing', () => {
      expect(() => setArxivSummaryAbortController(null)).not.toThrow();
    });
  });

  describe('summarizeArxivPaper', () => {
    it('throws when paper not found', async () => {
      await expect(
        summarizeArxivPaper(db, settingsDb, paperTopicsDb, '/data', 'nonexistent'),
      ).rejects.toThrow('Paper nonexistent not found');
    });

    it('delegates to summarizePaperCore with paper data', async () => {
      insertPaper(db, 'p1', 'Test Paper', 'Some abstract');
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: 'summary text',
        skipped: false,
      });

      const result = await summarizeArxivPaper(db, settingsDb, paperTopicsDb, '/data', 'p1');

      expect(result).toEqual({ success: true, summary: 'summary text', skipped: false });
      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        paperTopicsDb,
        '/data',
        'arXiv',
        'p1',
        'Test Paper',
        'Some abstract',
        true,
        undefined,
      );
    });

    it('passes skipIfAnalyzed=false when specified', async () => {
      insertPaper(db, 'p1', 'Paper', 'Abstract');
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: null,
        skipped: false,
      });

      await summarizeArxivPaper(db, settingsDb, paperTopicsDb, '/data', 'p1', false);

      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        paperTopicsDb,
        '/data',
        'arXiv',
        'p1',
        'Paper',
        'Abstract',
        false,
        undefined,
      );
    });

    it('passes abort signal through', async () => {
      insertPaper(db, 'p1', 'Paper', 'Abstract');
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: null,
        skipped: false,
      });
      const controller = new AbortController();

      await summarizeArxivPaper(
        db,
        settingsDb,
        paperTopicsDb,
        '/data',
        'p1',
        true,
        controller.signal,
      );

      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        paperTopicsDb,
        '/data',
        'arXiv',
        'p1',
        'Paper',
        'Abstract',
        true,
        controller.signal,
      );
    });

    it('returns skipped result when core returns skipped', async () => {
      insertPaper(db, 'p1', 'Paper', 'Abstract');
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: 'existing',
        skipped: true,
      });

      const result = await summarizeArxivPaper(db, settingsDb, paperTopicsDb, '/data', 'p1');
      expect(result.skipped).toBe(true);
      expect(result.summary).toBe('existing');
    });

    it('propagates errors from summarizePaperCore', async () => {
      insertPaper(db, 'p1', 'Paper', 'Abstract');
      vi.mocked(summarizePaperCore).mockRejectedValue(new Error('LLM error'));

      await expect(
        summarizeArxivPaper(db, settingsDb, paperTopicsDb, '/data', 'p1'),
      ).rejects.toThrow('LLM error');
    });
  });
});
