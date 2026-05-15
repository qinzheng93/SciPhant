import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';

vi.mock('../paper-shared.js', () => ({
  createAbortControllerManager: vi.fn(() => ({
    set: vi.fn(),
    stop: vi.fn(() => ({ success: true })),
    get: vi.fn(() => null),
  })),
  analyzeFullPaperCore: vi.fn(),
  getPaperAnalysisContent: vi.fn(),
}));

vi.mock('../conference-summary.js', () => ({
  getCategoryForConference: vi.fn(),
}));

import {
  stopConferenceAnalysis,
  setConferenceAnalysisAbortController,
  analyzeConferenceFullPaper,
  getConferencePaperAnalysis,
} from '../conference-analysis.js';
import { analyzeFullPaperCore, getPaperAnalysisContent } from '../paper-shared.js';
import { getCategoryForConference } from '../conference-summary.js';

describe('conference-analysis', () => {
  let SQL: any;
  let conferenceDb: SqlJsDatabase;
  let settingsDb: SqlJsDatabase;

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
  });

  describe('stopConferenceAnalysis', () => {
    it('returns success object', () => {
      const result = stopConferenceAnalysis();
      expect(result).toEqual({ success: true });
    });
  });

  describe('setConferenceAnalysisAbortController', () => {
    it('accepts an AbortController without throwing', () => {
      const ctrl = new AbortController();
      expect(() => setConferenceAnalysisAbortController(ctrl)).not.toThrow();
    });

    it('accepts null without throwing', () => {
      expect(() => setConferenceAnalysisAbortController(null)).not.toThrow();
    });
  });

  describe('analyzeConferenceFullPaper', () => {
    it('throws when conference category not found', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue(null);

      await expect(
        analyzeConferenceFullPaper(conferenceDb, settingsDb, '/data', 'p1'),
      ).rejects.toThrow('Conference category not found for paper p1');
    });

    it('throws when paper not found in DB', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('CVPR2025');

      await expect(
        analyzeConferenceFullPaper(conferenceDb, settingsDb, '/data', 'nonexistent'),
      ).rejects.toThrow('Conference paper nonexistent not found');
    });

    it('delegates to analyzeFullPaperCore with paper data', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('CVPR2025');
      conferenceDb.run(
        "INSERT INTO papers (id, title, abstract, conference_id, pdf_url) VALUES ('p1', 'Test Paper', 'Abstract', 1, 'https://example.com/paper.pdf')",
      );

      const mockResult = { success: true, result: { analysis: 'analysis text' } as any };
      vi.mocked(analyzeFullPaperCore).mockResolvedValue(mockResult);

      const result = await analyzeConferenceFullPaper(
        conferenceDb,
        settingsDb,
        '/data',
        'p1',
      );

      expect(result).toEqual(mockResult);
      expect(analyzeFullPaperCore).toHaveBeenCalledWith(
        settingsDb,
        '/data',
        'CVPR2025',
        'p1',
        'Test Paper',
        'https://example.com/paper.pdf',
        undefined,
        undefined,
      );
    });

    it('passes signal and onProgress to analyzeFullPaperCore', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('ICLR2024');
      conferenceDb.run(
        "INSERT INTO papers (id, title, abstract, conference_id, pdf_url) VALUES ('p1', 'Paper', 'Abs', 1, 'https://example.com/p.pdf')",
      );

      vi.mocked(analyzeFullPaperCore).mockResolvedValue({ success: true });

      const controller = new AbortController();
      const onProgress = vi.fn();

      await analyzeConferenceFullPaper(
        conferenceDb,
        settingsDb,
        '/data',
        'p1',
        controller.signal,
        onProgress,
      );

      expect(analyzeFullPaperCore).toHaveBeenCalledWith(
        settingsDb,
        '/data',
        'ICLR2024',
        'p1',
        'Paper',
        'https://example.com/p.pdf',
        controller.signal,
        onProgress,
      );
    });

    it('propagates errors from analyzeFullPaperCore', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('CVPR2025');
      conferenceDb.run(
        "INSERT INTO papers (id, title, abstract, conference_id, pdf_url) VALUES ('p1', 'Paper', 'Abs', 1, 'https://example.com/p.pdf')",
      );
      vi.mocked(analyzeFullPaperCore).mockRejectedValue(new Error('PDF extraction failed'));

      await expect(
        analyzeConferenceFullPaper(conferenceDb, settingsDb, '/data', 'p1'),
      ).rejects.toThrow('PDF extraction failed');
    });
  });

  describe('getConferencePaperAnalysis', () => {
    it('calls getPaperAnalysisContent with null category when conference not found', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue(null);
      vi.mocked(getPaperAnalysisContent).mockResolvedValue(null);

      const result = await getConferencePaperAnalysis(conferenceDb, '/data', 'p1');
      expect(result).toBeNull();
      expect(getPaperAnalysisContent).toHaveBeenCalledWith('/data', null, 'p1');
    });

    it('delegates to getPaperAnalysisContent with category', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('CVPR2025');
      vi.mocked(getPaperAnalysisContent).mockResolvedValue('# Analysis content');

      const result = await getConferencePaperAnalysis(conferenceDb, '/data', 'p1');
      expect(result).toBe('# Analysis content');
      expect(getPaperAnalysisContent).toHaveBeenCalledWith('/data', 'CVPR2025', 'p1');
    });

    it('returns null when analysis file does not exist', async () => {
      vi.mocked(getCategoryForConference).mockReturnValue('CVPR2025');
      vi.mocked(getPaperAnalysisContent).mockResolvedValue(null);

      const result = await getConferencePaperAnalysis(conferenceDb, '/data', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
