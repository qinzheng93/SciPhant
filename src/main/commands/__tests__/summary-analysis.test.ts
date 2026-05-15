import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stopArxivSummary, setArxivSummaryAbortController } from '../arxiv-summary.js';
import { stopArxivAnalysis, setArxivAnalysisAbortController, getArxivPaperAnalysis } from '../arxiv-analysis.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function createDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'summary-test-'));
}

describe('summary abort controller', () => {
  it('stopArxivSummary returns success', () => {
    expect(stopArxivSummary()).toEqual({ success: true });
  });

  it('setArxivSummaryAbortController sets and clears controller', () => {
    const ctrl = new AbortController();
    setArxivSummaryAbortController(ctrl);
    stopArxivSummary(); // should abort
    expect(ctrl.signal.aborted).toBe(true);
    setArxivSummaryAbortController(null);
  });
});

describe('analysis abort controller', () => {
  it('stopArxivAnalysis returns success when no controller', () => {
    expect(stopArxivAnalysis()).toEqual({ success: true });
  });

  it('stopArxivAnalysis aborts the controller', () => {
    const ctrl = new AbortController();
    setArxivAnalysisAbortController(ctrl);
    stopArxivAnalysis();
    expect(ctrl.signal.aborted).toBe(true);
    // Controller should be cleared
    stopArxivAnalysis(); // should not throw
  });

  it('setArxivAnalysisAbortController can set null', () => {
    expect(() => setArxivAnalysisAbortController(null)).not.toThrow();
  });
});

describe('getArxivPaperAnalysis', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = createDataDir();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns null when no analysis file exists', async () => {
    const result = await getArxivPaperAnalysis(dataDir, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns analysis content when file exists', async () => {
    mkdirSync(join(dataDir, 'analyses', 'arXiv'), { recursive: true });
    writeFileSync(join(dataDir, 'analyses', 'arXiv', '123.md'), '# Analysis\nContent here');

    const result = await getArxivPaperAnalysis(dataDir, '123');
    expect(result).toBe('# Analysis\nContent here');
  });
});
