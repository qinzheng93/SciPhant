import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildFilePath,
  writeAnalysisFile,
  readAnalysisFile,
  deleteAnalysisFile,
  listExistingPaperIds,
  clearAllAnalysisFiles,
} from '../analysis-files.js';

const ARXIV_CATEGORY = 'arXiv';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'blueberry-analysis-test-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('buildFilePath', () => {
  it('builds correct path for arXiv summary', () => {
    const path = buildFilePath(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345');
    expect(path).toBe(join(dataDir, 'summaries', 'arXiv', '2401.12345.md'));
  });

  it('builds correct path for conference analysis', () => {
    const path = buildFilePath(dataDir, 'analyses', 'CVPR2025', 'CVPR-2025-0001');
    expect(path).toBe(join(dataDir, 'analyses', 'CVPR2025', 'CVPR-2025-0001.md'));
  });
});

describe('writeAnalysisFile & readAnalysisFile', () => {
  it('writes and reads content', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345', '# Summary');
    const content = await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345');
    expect(content).toBe('# Summary');
  });

  it('returns null for non-existent file', async () => {
    const content = await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'nonexistent');
    expect(content).toBeNull();
  });

  it('overwrites existing file', async () => {
    await writeAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, '2401.12345', 'old');
    await writeAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, '2401.12345', 'new');
    const content = await readAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, '2401.12345');
    expect(content).toBe('new');
  });

  it('preserves version suffix in arXiv ID', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345v2', 'content');
    const content = await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345v2');
    expect(content).toBe('content');
  });
});

describe('deleteAnalysisFile', () => {
  it('deletes an existing file', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345', 'content');
    await deleteAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345');
    const content = await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345');
    expect(content).toBeNull();
  });

  it('silently ignores non-existent file', async () => {
    await expect(deleteAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'nonexistent')).resolves.toBeUndefined();
  });
});

describe('listExistingPaperIds', () => {
  it('returns empty set for non-existent directory', async () => {
    const ids = await listExistingPaperIds(dataDir, 'summaries', ARXIV_CATEGORY);
    expect(ids.size).toBe(0);
  });

  it('returns paper IDs from md files', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12345', 'a');
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, '2401.12346', 'b');

    const ids = await listExistingPaperIds(dataDir, 'summaries', ARXIV_CATEGORY);
    expect(ids).toContain('2401.12345');
    expect(ids).toContain('2401.12346');
    expect(ids.size).toBe(2);
  });
});

describe('clearAllAnalysisFiles', () => {
  it('clears both summaries and analyses when type not specified', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'p1', 's');
    await writeAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, 'p1', 'a');
    await clearAllAnalysisFiles(dataDir);
    expect(await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'p1')).toBeNull();
    expect(await readAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, 'p1')).toBeNull();
  });

  it('clears only specified type', async () => {
    await writeAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'p1', 's');
    await writeAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, 'p1', 'a');
    await clearAllAnalysisFiles(dataDir, 'summaries');
    expect(await readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, 'p1')).toBeNull();
    expect(await readAnalysisFile(dataDir, 'analyses', ARXIV_CATEGORY, 'p1')).toBe('a');
  });
});
