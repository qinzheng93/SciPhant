import { net } from 'electron';
import { PDFParse } from 'pdf-parse';
import { mkdir, readFile, access, open, rename, unlink } from 'fs/promises';
import { join } from 'path';
import { classifyDirectNetworkError } from './net-fetch.js';

function getPdfDir(dataDir: string, category: string): string {
  return join(dataDir, 'pdfs', category);
}

export function getPdfPath(dataDir: string, category: string, paperId: string): string {
  const fileName = paperId.endsWith('.pdf') ? paperId : `${paperId}.pdf`;
  return join(getPdfDir(dataDir, category), fileName);
}

function wrapDownloadError(e: unknown): Error {
  const classified = classifyDirectNetworkError(e);
  return new Error(`下载失败: ${classified.message}`);
}

async function downloadStreaming(
  url: string,
  filePath: string,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total?: number) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await net.fetch(url, { signal });
  } catch (e) {
    throw wrapDownloadError(e);
  }
  if (!response.ok) throw new Error(`下载失败 (HTTP ${response.status})`);

  const total = parseInt(response.headers.get('content-length') || '', 10) || undefined;
  if (!response.body) throw new Error('下载失败: 响应体为空');
  const reader = response.body.getReader();
  const tmpPath = `${filePath}.tmp`;
  const file = await open(tmpPath, 'w');
  let loaded = 0;
  let fileClosed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }

    await file.close();
    fileClosed = true;
    await rename(tmpPath, filePath);
  } catch (e) {
    if (!fileClosed) {
      await file.close().catch(() => {});
    }
    await unlink(tmpPath).catch(() => {});
    throw e;
  }
}

/**
 * Download a PDF from URL to local cache if not already present.
 * Returns the local file path.
 */
export async function ensurePdfDownloaded(
  url: string,
  signal?: AbortSignal,
  dataDir?: string,
  category?: string,
  paperId?: string,
  onProgress?: (loaded: number, total?: number) => void,
): Promise<string> {
  const pdfDir = getPdfDir(dataDir!, category!);
  const fileName = paperId!.endsWith('.pdf') ? paperId! : `${paperId!}.pdf`;
  const filePath = join(pdfDir, fileName);

  // Check if already cached
  try {
    await access(filePath);
    return filePath;
  } catch {
    // Not cached, proceed to download
  }

  await mkdir(pdfDir, { recursive: true });
  await downloadStreaming(url, filePath, signal, onProgress);

  return filePath;
}

/**
 * Download a PDF (if not cached) and extract its text content.
 */
export async function extractTextFromUrl(
  url: string,
  signal?: AbortSignal,
  dataDir?: string,
  category?: string,
  paperId?: string,
  onProgress?: (phase: string) => void,
): Promise<string> {
  onProgress?.('下载中');
  const filePath = await ensurePdfDownloaded(url, signal, dataDir, category, paperId);
  onProgress?.('解析中');

  try {
    const data = await readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(data) } as any);
    const result = await parser.getText();
    await parser.destroy();
    return result.text || '';
  } catch (e) {
    throw new Error(`解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
