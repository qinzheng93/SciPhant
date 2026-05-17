import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { todayStr, daysAgoStr, parseArxivIdFromInput, savePapers } from '../arxiv-api.js';
import initSqlJs from 'sql.js';

// ── Date helpers ──────────────────────────────────────

describe('todayStr', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today as YYYY-MM-DD', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:00'));
    expect(todayStr()).toBe('2024-03-15');
  });

  it('handles month boundary correctly', () => {
    vi.setSystemTime(new Date('2024-01-05T00:00:00'));
    expect(todayStr()).toBe('2024-01-05');
  });
});

describe('daysAgoStr', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns correct date for 1 day ago', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:00'));
    expect(daysAgoStr(1)).toBe('2024-03-14');
  });

  it('returns correct date for 7 days ago', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:00'));
    expect(daysAgoStr(7)).toBe('2024-03-08');
  });

  it('handles month rollover', () => {
    vi.setSystemTime(new Date('2024-03-01T12:00:00'));
    expect(daysAgoStr(1)).toBe('2024-02-29');
  });

  it('returns today when n is 0', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:00'));
    expect(daysAgoStr(0)).toBe('2024-03-15');
  });
});

// ── parseArxivIdFromInput ──────────────────────────────

describe('parseArxivIdFromInput', () => {
  it('parses bare ID', () => {
    expect(parseArxivIdFromInput('2301.00001')).toBe('2301.00001');
  });

  it('parses bare ID with version suffix and strips it', () => {
    expect(parseArxivIdFromInput('2301.00001v2')).toBe('2301.00001');
  });

  it('parses abs URL', () => {
    expect(parseArxivIdFromInput('https://arxiv.org/abs/2301.00001')).toBe('2301.00001');
  });

  it('parses abs URL with version', () => {
    expect(parseArxivIdFromInput('https://arxiv.org/abs/2301.00001v3')).toBe('2301.00001');
  });

  it('parses pdf URL', () => {
    expect(parseArxivIdFromInput('https://arxiv.org/pdf/2301.00001')).toBe('2301.00001');
  });

  it('parses html URL', () => {
    expect(parseArxivIdFromInput('https://arxiv.org/html/2301.00001')).toBe('2301.00001');
  });

  it('parses http URL', () => {
    expect(parseArxivIdFromInput('http://arxiv.org/abs/2301.00001')).toBe('2301.00001');
  });

  it('returns null for invalid input', () => {
    expect(parseArxivIdFromInput('invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseArxivIdFromInput('')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseArxivIdFromInput('  2301.00001  ')).toBe('2301.00001');
  });

  it('handles 5-digit suffix', () => {
    expect(parseArxivIdFromInput('2501.12345')).toBe('2501.12345');
  });
});

// ── savePapers ─────────────────────────────────────────

const PAPERS_SCHEMA = `
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

describe('savePapers', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs({
      locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
    });
  });

  it('inserts papers and returns [inserted, existing]', () => {
    const db = new SQL.Database();
    db.run(PAPERS_SCHEMA);

    const papers = [
      {
        arxiv_id: '2301.00001',
        title: 'Test Paper 1',
        authors: ['Alice'],
        abstract: 'Abstract 1',
        url: 'https://arxiv.org/abs/2301.00001',
        pdf_url: 'https://arxiv.org/pdf/2301.00001',
        published_date: '2024-01-01',
        updated_date: '2024-01-01',
        categories: ['cs.AI'],
      },
      {
        arxiv_id: '2301.00002',
        title: 'Test Paper 2',
        authors: ['Bob'],
        abstract: 'Abstract 2',
        url: 'https://arxiv.org/abs/2301.00002',
        pdf_url: 'https://arxiv.org/pdf/2301.00002',
        published_date: '2024-01-02',
        updated_date: '2024-01-02',
        categories: ['cs.LG'],
      },
    ];

    const [inserted, existing] = savePapers(db, papers);
    expect(inserted).toBe(2);
    expect(existing).toBe(0);

    const rows = db.exec('SELECT COUNT(*) FROM papers');
    expect(rows[0].values[0][0]).toBe(2);
  });

  it('skips duplicates with ON CONFLICT DO NOTHING', () => {
    const db = new SQL.Database();
    db.run(PAPERS_SCHEMA);

    const paper = {
      arxiv_id: '2301.00001',
      title: 'Test Paper',
      authors: ['Alice'],
      abstract: 'Abstract',
      url: 'https://arxiv.org/abs/2301.00001',
      pdf_url: 'https://arxiv.org/pdf/2301.00001',
      published_date: '2024-01-01',
      updated_date: '2024-01-01',
      categories: ['cs.AI'],
    };

    savePapers(db, [paper]);
    const [inserted, existing] = savePapers(db, [paper]);

    expect(inserted).toBe(0);
    expect(existing).toBe(1);
  });
});
