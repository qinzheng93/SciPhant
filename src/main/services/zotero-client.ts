import { readFile } from 'fs/promises';
import { ensurePdfDownloaded } from './pdf-extractor.js';

const CONNECTOR_BASE = 'http://127.0.0.1:23119';

export interface ZoteroCollection {
  key: string;
  name: string;
  numItems: number;
}

// ── Connector API ──

const CONNECTOR_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Zotero-Connector-API-Version': '3',
};

class ConnectorError extends Error {
  constructor(endpoint: string, status: number, body: string) {
    super(`Zotero ${endpoint} 失败: HTTP ${status} ${body}`);
  }
}

async function connectorFetch(
  endpoint: string,
  options?: RequestInit & { headers?: Record<string, string> },
): Promise<Response> {
  const res = await fetch(`${CONNECTOR_BASE}/connector${endpoint}`, {
    ...options,
    headers: { ...CONNECTOR_HEADERS, ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ConnectorError(endpoint.replace(/^\//, ''), res.status, text);
  }
  return res;
}

export async function pingZotero(): Promise<boolean> {
  try {
    await connectorFetch('/ping', { method: 'POST', body: JSON.stringify({}) });
    return true;
  } catch {
    return false;
  }
}

export async function getConnectorCollections(): Promise<ZoteroCollection[]> {
  const res = await connectorFetch('/getSelectedCollection', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  const data = await res.json();
  const targets: Array<{ id: string; name: string }> = data.targets || [];
  return targets
    .filter(t => t.id.startsWith('C'))
    .map(t => ({ key: t.id, name: t.name, numItems: 0 }));
}

export interface ConnectorItem {
  id: string;
  itemType: string;
  title: string;
  abstractNote?: string;
  date?: string;
  url?: string;
  repository?: string;
  archiveID?: string;
  extra?: string;
  proceedingsTitle?: string;
  conferenceName?: string;
  pages?: string;
  creators: Array<{ creatorType: string; firstName: string; lastName: string }>;
  tags: Array<{ tag: string }>;
  notes: Array<{ note: string }>;
  attachments: never[]; // always empty — handled via saveAttachment
  seeAlso: never[];
}

export async function connectorSaveItems(
  sessionID: string,
  uri: string,
  items: ConnectorItem[],
): Promise<void> {
  await connectorFetch('/saveItems', {
    method: 'POST',
    body: JSON.stringify({ sessionID, uri, items, singleFile: false }),
  });
}

export async function connectorUpdateSession(
  sessionID: string,
  target: string,
  tags: string[] = [],
): Promise<void> {
  await connectorFetch('/updateSession', {
    method: 'POST',
    body: JSON.stringify({ sessionID, target, tags }),
  });
}

export async function connectorSaveAttachment(
  sessionID: string,
  parentItemID: string,
  filePath: string,
  title: string,
  url: string,
): Promise<void> {
  const fileData = await readFile(filePath);
  await connectorFetch('/saveAttachment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-Metadata': JSON.stringify({ sessionID, parentItemID, title, url }),
    },
    body: fileData,
  });
}

// ── Export helpers ──

export function parseCreators(authors: string[]): Array<{ creatorType: 'author'; firstName: string; lastName: string }> {
  return authors.map(name => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return { creatorType: 'author' as const, firstName: '', lastName: parts[0] };
    return { creatorType: 'author' as const, firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  });
}

export function buildNotes(summaryHtml?: string, analysisHtml?: string): string[] {
  const parts: string[] = [];
  if (summaryHtml) parts.push(`<h1>论文总结</h1>${summaryHtml}`);
  if (analysisHtml) parts.push(`<h1>论文分析</h1>${analysisHtml}`);
  return parts;
}

export interface ExportResult {
  success: boolean;
  collectionMoved: boolean;
  pdfAttached: boolean;
}

export async function exportToZotero(
  item: ConnectorItem,
  pdfUrl: string,
  pdfCategory: string,
  paperId: string,
  collectionKey: string,
  dataDir: string,
): Promise<ExportResult> {
  const sessionID = `blueberry-${pdfCategory}-${paperId}-${Date.now()}`;

  await connectorSaveItems(sessionID, item.url || '', [item]);

  let collectionMoved = false;
  try {
    await connectorUpdateSession(sessionID, collectionKey);
    collectionMoved = true;
  } catch {
    // Item created but not moved to target collection
  }

  let pdfAttached = false;
  if (pdfUrl) {
    try {
      const localPath = await ensurePdfDownloaded(pdfUrl, undefined, dataDir, pdfCategory, paperId);
      await connectorSaveAttachment(sessionID, 'item_0', localPath, 'Full Text PDF', pdfUrl);
      pdfAttached = true;
    } catch {
      // PDF download or upload failed
    }
  }

  return { success: true, collectionMoved, pdfAttached };
}

// ── Export item builders ──

export function buildArxivExportItem(
  row: unknown[],
  summaryHtml?: string,
  analysisHtml?: string,
): { item: ConnectorItem; pdfUrl: string; paperId: string } {
  const paperId = (row[0] as string).replace(/v\d+$/, '');
  const categories: string[] = JSON.parse(row[7] as string);
  const extraLines: string[] = [];
  if (categories.length > 0) extraLines.push(`Categories: ${categories.join(', ')}`);

  const item: ConnectorItem = {
    id: 'item_0',
    itemType: 'preprint',
    title: row[1] as string,
    abstractNote: (row[3] as string) || '',
    date: (row[6] as string) || '',
    url: ((row[4] as string) || '').replace(/v\d+$/, ''),
    repository: 'arXiv',
    archiveID: `arXiv:${paperId}`,
    extra: extraLines.join('\n'),
    creators: parseCreators(JSON.parse(row[2] as string)),
    tags: [],
    notes: buildNotes(summaryHtml, analysisHtml).map(n => ({ note: n })),
    attachments: [],
    seeAlso: [],
  };

  return { item, pdfUrl: (row[5] as string) || '', paperId };
}

export function buildConferenceExportItem(
  row: unknown[],
  summaryHtml?: string,
  analysisHtml?: string,
): { item: ConnectorItem; pdfUrl: string; category: string; paperId: string } {
  const shortName = row[7] as string;
  const year = row[8] as number;
  const fullName = (row[9] as string) || `${shortName} ${year}`;

  const item: ConnectorItem = {
    id: 'item_0',
    itemType: 'conferencePaper',
    title: row[1] as string,
    abstractNote: (row[3] as string) || '',
    date: String(year),
    url: (row[4] as string) || '',
    proceedingsTitle: fullName,
    conferenceName: `${shortName} ${year}`,
    pages: (row[6] as string) || '',
    repository: shortName,
    archiveID: row[0] as string,
    creators: parseCreators(JSON.parse(row[2] as string)),
    tags: [],
    notes: buildNotes(summaryHtml, analysisHtml).map(n => ({ note: n })),
    attachments: [],
    seeAlso: [],
  };

  const category = `${shortName}${year}`;
  return { item, pdfUrl: (row[5] as string) || '', category, paperId: row[0] as string };
}
