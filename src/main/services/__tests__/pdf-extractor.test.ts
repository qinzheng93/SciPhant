import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { net } from 'electron';
import { ensurePdfDownloaded, getPdfPath } from '../pdf-extractor.js';

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(),
  },
}));

const mockedFetch = vi.mocked(net.fetch);

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function responseFromChunks(chunks: Uint8Array[], failAfterChunks = false): Response {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (failAfterChunks) {
        controller.error(new Error('stream failed'));
      } else {
        controller.close();
      }
    },
  }), {
    status: 200,
    headers: { 'content-length': String(chunks.reduce((sum, chunk) => sum + chunk.length, 0)) },
  });
}

describe('pdf-extractor', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'blueberry-pdf-test-'));
    mockedFetch.mockReset();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('renames a completed temporary download to the final PDF path', async () => {
    const url = 'https://arxiv.org/pdf/2401.12345.pdf';
    const content = new TextEncoder().encode('%PDF complete');
    mockedFetch.mockResolvedValue(responseFromChunks([content]));

    const filePath = await ensurePdfDownloaded(url, undefined, dataDir, 'arXiv', '2401.12345');

    expect(filePath).toBe(getPdfPath(dataDir, 'arXiv', '2401.12345'));
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('%PDF complete');
    await expect(pathExists(`${filePath}.tmp`)).resolves.toBe(false);
  });

  it('removes the temporary file and leaves no final PDF when streaming fails', async () => {
    const url = 'https://arxiv.org/pdf/2401.67890.pdf';
    const partialContent = new TextEncoder().encode('%PDF partial');
    mockedFetch.mockResolvedValue(responseFromChunks([partialContent], true));

    const filePath = getPdfPath(dataDir, 'arXiv', '2401.67890');

    await expect(ensurePdfDownloaded(url, undefined, dataDir, 'arXiv', '2401.67890')).rejects.toThrow('stream failed');
    await expect(pathExists(filePath)).resolves.toBe(false);
    await expect(pathExists(`${filePath}.tmp`)).resolves.toBe(false);
  });

  it('stores PDFs in category subdirectory', async () => {
    const url = 'https://example.com/paper.pdf';
    const content = new TextEncoder().encode('%PDF conf');
    mockedFetch.mockResolvedValue(responseFromChunks([content]));

    const filePath = await ensurePdfDownloaded(url, undefined, dataDir, 'CVPR2025', 'CVPR-2025-0001');

    expect(filePath).toBe(join(dataDir, 'pdfs', 'CVPR2025', 'CVPR-2025-0001.pdf'));
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('%PDF conf');
  });

  it('returns cached file without re-downloading', async () => {
    const url = 'https://arxiv.org/pdf/2401.12345.pdf';
    const content = new TextEncoder().encode('%PDF cached');
    mockedFetch.mockResolvedValue(responseFromChunks([content]));

    // First download
    const path1 = await ensurePdfDownloaded(url, undefined, dataDir, 'arXiv', '2401.12345');

    // Second call should not trigger another fetch
    mockedFetch.mockClear();
    const path2 = await ensurePdfDownloaded(url, undefined, dataDir, 'arXiv', '2401.12345');

    expect(path1).toBe(path2);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
