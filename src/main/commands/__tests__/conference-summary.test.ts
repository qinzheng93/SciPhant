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
  getCategoryForConference,
  checkConferenceSummaryStatus,
  getConferenceSummaryContent,
  stopConferenceSummary,
  setConferenceSummaryAbortController,
  summarizeConferencePaper,
} from '../conference-summary.js';
import { listExistingPaperIds, readAnalysisFile } from '../../services/analysis-files.js';
import { summarizePaperCore } from '../paper-shared.js';

const CONFERENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS conferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  short_name TEXT NOT NULL,
  year INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  conference_id INTEGER NOT NULL,
  pdf_url TEXT,
  FOREIGN KEY (conference_id) REFERENCES conferences(id)
);
`;

function insertConference(
  db: SqlJsDatabase,
  id: number,
  shortName: string,
  year: number,
) {
  db.run('INSERT INTO conferences (id, short_name, year) VALUES (?, ?, ?)', [
    id,
    shortName,
    year,
  ]);
}

function insertConfPaper(
  db: SqlJsDatabase,
  id: string,
  title: string,
  abstract: string,
  conferenceId: number,
) {
  db.run(
    'INSERT INTO papers (id, title, abstract, conference_id) VALUES (?, ?, ?, ?)',
    [id, title, abstract, conferenceId],
  );
}

describe('conference-summary', () => {
  let SQL: any;
  let conferenceDb: SqlJsDatabase;
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
    conferenceDb = new SQL.Database();
    conferenceDb.run(CONFERENCE_SCHEMA);
    settingsDb = new SQL.Database();
    paperTopicsDb = new SQL.Database();
  });

  describe('getCategoryForConference', () => {
    it('returns short_name + year for a paper', () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 1);
      expect(getCategoryForConference(conferenceDb, 'p1')).toBe('CVPR2025');
    });

    it('returns null when paper does not exist', () => {
      expect(getCategoryForConference(conferenceDb, 'nonexistent')).toBeNull();
    });

    it('returns null when conference does not exist for paper', () => {
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 999);
      expect(getCategoryForConference(conferenceDb, 'p1')).toBeNull();
    });

    it('handles different conference names', () => {
      insertConference(conferenceDb, 2, 'ICLR', 2024);
      insertConfPaper(conferenceDb, 'p2', 'Title', 'Abstract', 2);
      expect(getCategoryForConference(conferenceDb, 'p2')).toBe('ICLR2024');
    });
  });

  describe('checkConferenceSummaryStatus', () => {
    it('returns empty object for empty paperIds', async () => {
      const result = await checkConferenceSummaryStatus(conferenceDb, '/data', []);
      expect(result).toEqual({});
      expect(listExistingPaperIds).not.toHaveBeenCalled();
    });

    it('returns empty result for papers not in the DB', async () => {
      const result = await checkConferenceSummaryStatus(conferenceDb, '/data', ['missing']);
      // Papers not found in DB are not included in the result map
      expect(result).toEqual({});
    });

    it('returns true for papers with existing summaries', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 1);
      insertConfPaper(conferenceDb, 'p2', 'Title2', 'Abstract2', 1);

      vi.mocked(listExistingPaperIds).mockResolvedValue(new Set(['p1']));

      const result = await checkConferenceSummaryStatus(conferenceDb, '/data', ['p1', 'p2']);
      expect(result).toEqual({ p1: true, p2: false });
      expect(listExistingPaperIds).toHaveBeenCalledWith('/data', 'summaries', 'CVPR2025');
    });

    it('returns false for paper with missing conference info', async () => {
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 999);
      const result = await checkConferenceSummaryStatus(conferenceDb, '/data', ['p1']);
      expect(result).toEqual({ p1: false });
    });

    it('caches listExistingPaperIds call per category', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConference(conferenceDb, 2, 'ICLR', 2024);
      insertConfPaper(conferenceDb, 'p1', 'T1', 'A1', 1);
      insertConfPaper(conferenceDb, 'p2', 'T2', 'A2', 2);
      insertConfPaper(conferenceDb, 'p3', 'T3', 'A3', 1);

      vi.mocked(listExistingPaperIds)
        .mockResolvedValueOnce(new Set(['p1']))
        .mockResolvedValueOnce(new Set(['p2']));

      const result = await checkConferenceSummaryStatus(conferenceDb, '/data', ['p1', 'p2', 'p3']);
      expect(result).toEqual({ p1: true, p2: true, p3: false });
      expect(listExistingPaperIds).toHaveBeenCalledTimes(2);
      expect(listExistingPaperIds).toHaveBeenCalledWith('/data', 'summaries', 'CVPR2025');
      expect(listExistingPaperIds).toHaveBeenCalledWith('/data', 'summaries', 'ICLR2024');
    });
  });

  describe('getConferenceSummaryContent', () => {
    it('returns null when paper has no conference category', async () => {
      const result = await getConferenceSummaryContent(conferenceDb, '/data', 'nonexistent');
      expect(result).toBeNull();
      expect(readAnalysisFile).not.toHaveBeenCalled();
    });

    it('reads summary file with correct category', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 1);
      vi.mocked(readAnalysisFile).mockResolvedValue('# Summary');

      const result = await getConferenceSummaryContent(conferenceDb, '/data', 'p1');
      expect(result).toBe('# Summary');
      expect(readAnalysisFile).toHaveBeenCalledWith('/data', 'summaries', 'CVPR2025', 'p1');
    });

    it('returns null when file does not exist', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 1);
      vi.mocked(readAnalysisFile).mockResolvedValue(null);

      const result = await getConferenceSummaryContent(conferenceDb, '/data', 'p1');
      expect(result).toBeNull();
    });
  });

  describe('stopConferenceSummary', () => {
    it('returns success object', () => {
      const result = stopConferenceSummary();
      expect(result).toEqual({ success: true });
    });
  });

  describe('setConferenceSummaryAbortController', () => {
    it('accepts an AbortController without throwing', () => {
      const ctrl = new AbortController();
      expect(() => setConferenceSummaryAbortController(ctrl)).not.toThrow();
    });

    it('accepts null without throwing', () => {
      expect(() => setConferenceSummaryAbortController(null)).not.toThrow();
    });
  });

  describe('summarizeConferencePaper', () => {
    it('throws when conference category not found', async () => {
      insertConfPaper(conferenceDb, 'p1', 'Title', 'Abstract', 999);
      await expect(
        summarizeConferencePaper(conferenceDb, settingsDb, paperTopicsDb, '/data', 'p1'),
      ).rejects.toThrow('Conference category not found for paper p1');
    });

    it('throws when paper not found in DB', async () => {
      await expect(
        summarizeConferencePaper(conferenceDb, settingsDb, paperTopicsDb, '/data', 'nonexistent'),
      ).rejects.toThrow('Conference category not found for paper nonexistent');
    });

    it('delegates to summarizePaperCore with paper data', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Test Paper', 'Some abstract', 1);
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: 'summary text',
        skipped: false,
      });

      const result = await summarizeConferencePaper(
        conferenceDb,
        settingsDb,
        paperTopicsDb,
        '/data',
        'p1',
      );

      expect(result).toEqual({ success: true, summary: 'summary text', skipped: false });
      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        paperTopicsDb,
        '/data',
        'CVPR2025',
        'p1',
        'Test Paper',
        'Some abstract',
        true,
        undefined,
      );
    });

    it('passes skipIfAnalyzed=false when specified', async () => {
      insertConference(conferenceDb, 1, 'ICLR', 2024);
      insertConfPaper(conferenceDb, 'p1', 'Paper', 'Abstract', 1);
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: null,
        skipped: false,
      });

      await summarizeConferencePaper(
        conferenceDb,
        settingsDb,
        paperTopicsDb,
        '/data',
        'p1',
        false,
      );

      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        paperTopicsDb,
        '/data',
        'ICLR2024',
        'p1',
        'Paper',
        'Abstract',
        false,
        undefined,
      );
    });

    it('passes abort signal through', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Paper', 'Abstract', 1);
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: null,
        skipped: false,
      });
      const controller = new AbortController();

      await summarizeConferencePaper(
        conferenceDb,
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
        'CVPR2025',
        'p1',
        'Paper',
        'Abstract',
        true,
        controller.signal,
      );
    });

    it('works with null paperTopicsDb', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Paper', 'Abstract', 1);
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: 'result',
        skipped: false,
      });

      const result = await summarizeConferencePaper(
        conferenceDb,
        settingsDb,
        null,
        '/data',
        'p1',
      );

      expect(result.success).toBe(true);
      expect(summarizePaperCore).toHaveBeenCalledWith(
        settingsDb,
        null,
        '/data',
        'CVPR2025',
        'p1',
        'Paper',
        'Abstract',
        true,
        undefined,
      );
    });

    it('returns skipped result from core', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Paper', 'Abstract', 1);
      vi.mocked(summarizePaperCore).mockResolvedValue({
        success: true,
        summary: 'existing',
        skipped: true,
      });

      const result = await summarizeConferencePaper(
        conferenceDb,
        settingsDb,
        paperTopicsDb,
        '/data',
        'p1',
      );
      expect(result.skipped).toBe(true);
      expect(result.summary).toBe('existing');
    });

    it('propagates errors from summarizePaperCore', async () => {
      insertConference(conferenceDb, 1, 'CVPR', 2025);
      insertConfPaper(conferenceDb, 'p1', 'Paper', 'Abstract', 1);
      vi.mocked(summarizePaperCore).mockRejectedValue(new Error('LLM error'));

      await expect(
        summarizeConferencePaper(conferenceDb, settingsDb, paperTopicsDb, '/data', 'p1'),
      ).rejects.toThrow('LLM error');
    });
  });
});
