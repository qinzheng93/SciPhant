import { ipcMain, dialog, app, shell } from 'electron';
import * as fs from 'fs/promises';
import { join } from 'path';
import type { BrowserWindow } from 'electron';
import type { Database } from './database/connection';
import type { SettingsDb } from './database/settings';
import type { PaperTopicsDb } from './database/paper-topics';
import * as arxivPaperCmd from './commands/arxiv-paper';
import * as configCmd from './commands/config';
import * as arxivFetchCmd from './commands/arxiv-fetch';
import * as arxivSummaryCmd from './commands/arxiv-summary';
import * as arxivAnalysisCmd from './commands/arxiv-analysis';
import * as llmCmd from './commands/llm';
import * as rebuildArxivTopics from './commands/rebuild-arxiv-topics';
import * as rebuildConferenceTopics from './commands/rebuild-conference-topics';
import * as conferencePaperCmd from './commands/conference-paper';
import * as conferenceSummaryCmd from './commands/conference-summary';
import * as conferenceAnalysisCmd from './commands/conference-analysis';
import * as conferenceImportCmd from './commands/conference-import';
import initSqlJs from 'sql.js';
import * as fsSync from 'fs';
import { ensurePdfDownloaded, getPdfPath } from './services/pdf-extractor';
import { fetchCollections, createItem, createChildItems, type ChildItemPayload } from './services/zotero-client';
import { loadZoteroConfig, saveDataDir, resetDataDir } from './commands/config';
import {
  deleteAnalysisFile,
  clearAllAnalysisFiles,
} from './services/analysis-files';
import { checkArxivSummaryStatus, getArxivSummaryContent } from './commands/arxiv-summary';
import {
  getCategoryForConference,
  checkConferenceSummaryStatus,
  getConferenceSummaryContent,
} from './commands/conference-summary';

function handle(channel: string, fn: (...args: any[]) => Promise<any>) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[IPC] ${channel} error:`, err);
      throw err;
    }
  });
}

export function registerIpcHandlers(
  arxivDb: Database,
  conferenceDb: Database,
  settingsDb: SettingsDb,
  paperTopicsDb: PaperTopicsDb,
  dataDir: string,
  mainWindow: BrowserWindow,
): void {
  const sqlArxivDb = arxivDb.getDb();
  const sqlConferenceDb = conferenceDb.getDb();
  const sqlSettingsDb = settingsDb.getDb();
  const sqlPaperTopicsDb = paperTopicsDb.getDb();

  // Serial queue for topic association updates
  let topicQueueChain = Promise.resolve();
  const enqueueTopicUpdate = (fn: () => void) => {
    topicQueueChain = topicQueueChain.then(fn, fn);
    return topicQueueChain;
  };

  // Paper (read-only)
  handle('arxiv:list-papers', async (params) => arxivPaperCmd.listArxivPapers(sqlArxivDb, sqlPaperTopicsDb, params));
  handle('arxiv:list-fetch-dates', async () => arxivPaperCmd.listArxivFetchDates(sqlArxivDb));
  handle('arxiv:check-papers-summary-status', async (paperIds: string[]) => checkArxivSummaryStatus(dataDir, paperIds));
  handle('arxiv:get-paper-summary', async (paperId: string) => getArxivSummaryContent(dataDir, paperId));

  // Config
  handle('list-topics', async () => configCmd.listTopics(sqlPaperTopicsDb));
  handle('save-topic', async (topic) => {
    try {
      const result = configCmd.saveTopic(sqlPaperTopicsDb, topic);
      const topicId = result.id;
      await enqueueTopicUpdate(() => {
        rebuildArxivTopics.updateArxivTopicAssociations(sqlArxivDb, sqlPaperTopicsDb, topicId);
        rebuildConferenceTopics.updateConferenceTopicAssociations(sqlConferenceDb, sqlPaperTopicsDb, topicId);
        paperTopicsDb.save();
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        return { error: '主题名称已存在' };
      }
      throw err;
    }
  });
  handle('delete-topic', async (topicId) => {
    configCmd.deleteTopic(sqlPaperTopicsDb, topicId);
    await enqueueTopicUpdate(() => {
      rebuildArxivTopics.deleteArxivTopicAssociations(sqlPaperTopicsDb, topicId);
      rebuildConferenceTopics.deleteConferenceTopicAssociations(sqlPaperTopicsDb, topicId);
      paperTopicsDb.save();
    });
  });
  handle('rebuild-paper-topics', async () => {
    await enqueueTopicUpdate(() => {
      rebuildArxivTopics.rebuildArxivPaperTopics(sqlArxivDb, sqlPaperTopicsDb);
      rebuildConferenceTopics.rebuildConferencePaperTopics(sqlConferenceDb, sqlPaperTopicsDb);
      paperTopicsDb.save();
    });
    return { success: true };
  });
  handle('get-config', async () => configCmd.getConfig(sqlSettingsDb));
  handle('update-config', async (config) => {
    configCmd.updateConfig(sqlSettingsDb, config.llm, config.output, config.zotero, config.theme);
    await settingsDb.save();
  });
  handle('list-categories', async () => configCmd.listCategories(sqlArxivDb));
  handle('save-category', async (category) => {
    const result = configCmd.saveCategory(sqlArxivDb, category);
    await arxivDb.save();
    return result;
  });
  handle('delete-category', async (categoryId) => {
    configCmd.deleteCategory(sqlArxivDb, categoryId);
    await arxivDb.save();
  });
  handle('clear-data', async () => {
    const result = configCmd.clearAllData(sqlArxivDb, sqlConferenceDb, sqlSettingsDb, sqlPaperTopicsDb);
    await clearAllAnalysisFiles(dataDir);
    await arxivDb.save();
    await conferenceDb.save();
    await settingsDb.save();
    await paperTopicsDb.save();
    return result;
  });

  // Data directory
  handle('get-data-dir', async () => dataDir);
  handle('set-data-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择数据目录',
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };
    const newDir = result.filePaths[0];
    // Validate writable
    try {
      const testFile = join(newDir, '.blueberry-write-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
    } catch {
      return { success: false, error: '目录不可写' };
    }
    saveDataDir(sqlSettingsDb, newDir);
    await settingsDb.save();
    app.relaunch();
    app.exit(0);
    return { success: true };
  });
  handle('reset-data-dir', async () => {
    resetDataDir(sqlSettingsDb);
    await settingsDb.save();
    app.relaunch();
    app.exit(0);
    return { success: true };
  });
  handle('clear-analyses', async () => {
    await clearAllAnalysisFiles(dataDir);
    return { success: true };
  });
  handle('test-zotero-connection', async () => configCmd.testZoteroConnection(sqlSettingsDb));

  // Fetch
  handle('arxiv:fetch-papers', async (categories) => {
    const result = await arxivFetchCmd.fetchArxivPapers(sqlArxivDb, sqlPaperTopicsDb, categories || []);
    await arxivDb.save();
    await paperTopicsDb.save();
    return result;
  });
  handle('arxiv:fetch-papers-this-week', async (categories) => {
    const result = await arxivFetchCmd.fetchArxivPapersThisWeek(sqlArxivDb, sqlPaperTopicsDb, categories || []);
    await arxivDb.save();
    await paperTopicsDb.save();
    return result;
  });
  ipcMain.handle('arxiv:fetch-papers-by-date', async (_event, params) => {
    try {
      const result = await arxivFetchCmd.fetchArxivPapersByDate(sqlArxivDb, sqlPaperTopicsDb, params);
      await arxivDb.save();
      await paperTopicsDb.save();
      return result;
    } catch (err) {
      console.error('[IPC] arxiv:fetch-papers-by-date error:', err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        local_count: 0,
        new_count: 0,
        total_count: 0,
        failed_categories: [],
        failed_details: [],
        error: message,
      };
    }
  });

  // Fetch single paper
  handle('arxiv:fetch-single-paper', async (input: string) => {
    const result = await arxivFetchCmd.fetchArxivPapersByIds(sqlArxivDb, sqlPaperTopicsDb, input);
    if (result.fetched.length > 0) {
      await arxivDb.save();
      await paperTopicsDb.save();
    }
    return result;
  });

  // Summary (shallow analysis)
  ipcMain.handle('arxiv:summarize-paper', async (_event, paperId, skipIfAnalyzed) => {
    const controller = new AbortController();
    arxivSummaryCmd.setArxivSummaryAbortController(controller);
    try {
      const result = await arxivSummaryCmd.summarizeArxivPaper(sqlArxivDb, sqlSettingsDb, sqlPaperTopicsDb, dataDir, paperId, skipIfAnalyzed, controller.signal);
      await arxivDb.save();
      await paperTopicsDb.save();
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      throw err;
    } finally {
      arxivSummaryCmd.setArxivSummaryAbortController(null);
    }
  });
  handle('arxiv:stop-summary', async () => arxivSummaryCmd.stopArxivSummary());
  handle('test-llm-connection', async () => llmCmd.testLLMConnection(sqlSettingsDb));

  // PDF download
  handle('arxiv:download-pdf', async (paperId) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) {
      throw new Error(`Paper ${paperId} not found`);
    }
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) {
      throw new Error(`Paper ${paperId} has no PDF URL`);
    }
    const filePath = await ensurePdfDownloaded(pdfUrl, undefined, dataDir, (loaded, total) => {
      mainWindow.webContents.send('pdf-download-progress', { paperId, loaded, total });
    });
    return filePath;
  });

  handle('arxiv:open-pdf', async (paperId) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, pdfUrl);
    await shell.openPath(localPath);
  });

  handle('arxiv:is-pdf-cached', async (paperId) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return false;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return false;
    const localPath = getPdfPath(dataDir, pdfUrl);
    try {
      await fs.access(localPath);
      return true;
    } catch {
      return false;
    }
  });

  handle('arxiv:delete-pdf', async (paperId) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, pdfUrl);
    try {
      await fs.unlink(localPath);
    } catch { /* ignore */ }
  });

  handle('arxiv:delete-summary', async (paperId) => {
    await deleteAnalysisFile(dataDir, 'summaries', 'arXiv', paperId);
  });

  handle('arxiv:delete-analysis', async (paperId) => {
    await deleteAnalysisFile(dataDir, 'analyses', 'arXiv', paperId);
  });

  // Analysis (full paper)
  ipcMain.handle('arxiv:analyze-full-paper', async (_event, paperId) => {
    const controller = new AbortController();
    arxivAnalysisCmd.setArxivAnalysisAbortController(controller);
    try {
      const result = await arxivAnalysisCmd.analyzeArxivFullPaper(sqlArxivDb, sqlSettingsDb, dataDir, paperId, controller.signal, (phase) => {
        mainWindow.webContents.send('analysis-progress', phase);
      });
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.error(`[Analysis] FAILED for paper ${paperId}:`, err);
      throw err;
    } finally {
      arxivAnalysisCmd.setArxivAnalysisAbortController(null);
    }
  });
  handle('arxiv:get-paper-analysis', async (paperId) => arxivAnalysisCmd.getArxivPaperAnalysis(dataDir, paperId));
  handle('arxiv:stop-analysis', async () => arxivAnalysisCmd.stopArxivAnalysis());

  // Zotero
  handle('list-zotero-collections', async () => {
    const config = loadZoteroConfig(sqlSettingsDb);
    if (!config.api_key || !config.user_id) {
      throw new Error('Zotero API Key 和 User ID 未配置');
    }
    return fetchCollections(config.user_id, config.api_key);
  });

  handle('export-paper-to-zotero', async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    const config = loadZoteroConfig(sqlSettingsDb);
    if (!config.api_key || !config.user_id) {
      throw new Error('Zotero API Key 和 User ID 未配置');
    }
    // Fetch paper from DB
    const results = sqlArxivDb.exec(
      'SELECT id, title, authors, abstract_text, url, pdf_url, published_date, categories FROM papers WHERE id = ?',
      [paperId],
    );
    if (results.length === 0 || results[0].values.length === 0) {
      throw new Error(`Paper ${paperId} not found`);
    }
    const row = results[0].values[0];
    const authors: string[] = JSON.parse(row[2] as string);
    const creators = authors.map(name => {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return { creatorType: 'author' as const, firstName: '', lastName: parts[0] };
      return { creatorType: 'author' as const, firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
    });

    // Strip version suffix from arXiv ID (e.g. "2401.12345v2" → "2401.12345")
    const arxivId = (row[0] as string).replace(/v\d+$/, '');
    const pdfUrl = (row[5] as string) || '';
    const publishedDate = (row[6] as string) || '';
    const categories: string[] = JSON.parse(row[7] as string);

    // 1. Create main item
    const arxivRef = `arXiv:${arxivId}`;
    const extraLines: string[] = [];
    if (categories.length > 0) {
      extraLines.push(`Categories: ${categories.join(', ')}`);
    }
    const itemKey = await createItem(config.user_id, config.api_key, collectionKey, {
      itemType: 'preprint',
      title: row[1] as string,
      abstractNote: (row[3] as string) || '',
      date: publishedDate,
      url: ((row[4] as string) || '').replace(/v\d+$/, ''),
      repository: 'arXiv',
      archiveID: arxivRef,
      extra: extraLines.join('\n'),
      creators,
      tags: [],
      collections: [],
    });

    // 2. Build child items (PDF attachment + notes)
    const children: ChildItemPayload[] = [];

    // 2a. PDF attachment — only if already cached locally
    if (pdfUrl) {
      const localPath = getPdfPath(dataDir, pdfUrl);
      try {
        await fs.access(localPath);
        children.push({
          itemType: 'attachment',
          parentItem: itemKey,
          linkMode: 'linked_file',
          path: localPath,
          title: 'Full Text PDF',
          contentType: 'application/pdf',
          tags: [{ tag: 'arXiv' }],
        });
      } catch {
        // PDF not cached locally, skip attachment
      }
    }

    // 2b. Notes — use pre-converted HTML from renderer
    const noteParts: string[] = [];
    if (summaryHtml) {
      noteParts.push(`<h1>论文总结</h1>${summaryHtml}`);
    }
    if (analysisHtml) {
      noteParts.push(`<h1>论文分析</h1>${analysisHtml}`);
    }
    if (noteParts.length > 0) {
      children.push({
        itemType: 'note',
        parentItem: itemKey,
        note: noteParts.join('\n<hr>\n'),
        tags: [],
      });
    }

    // 3. Create all child items
    if (children.length > 0) {
      await createChildItems(config.user_id, config.api_key, children);
    }

    return { success: true, itemKey };
  });

  // ── Conference mode ──

  // Conference papers (read-only from bundled DB)
  handle('conference:list-conferences', async () => conferencePaperCmd.listConferences(sqlConferenceDb));
  handle('conference:list-papers', async (params) =>
    conferencePaperCmd.listConferencePapers(sqlConferenceDb, sqlArxivDb, sqlPaperTopicsDb, params),
  );
  handle('conference:check-papers-summary-status', async (paperIds: string[]) =>
    checkConferenceSummaryStatus(sqlConferenceDb, dataDir, paperIds),
  );
  handle('conference:get-paper-summary', async (paperId: string) =>
    getConferenceSummaryContent(sqlConferenceDb, dataDir, paperId),
  );
  handle('conference:list-tracks', async (conferenceId) =>
    conferencePaperCmd.listConferenceTracks(sqlConferenceDb, conferenceId),
  );

  // Conference summary
  ipcMain.handle('conference:summarize-paper', async (_event, paperId, skipIfAnalyzed) => {
    const controller = new AbortController();
    conferenceSummaryCmd.setConferenceSummaryAbortController(controller);
    try {
      const result = await conferenceSummaryCmd.summarizeConferencePaper(
        sqlConferenceDb, sqlSettingsDb, sqlPaperTopicsDb, dataDir, paperId, skipIfAnalyzed, controller.signal,
      );
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      throw err;
    } finally {
      conferenceSummaryCmd.setConferenceSummaryAbortController(null);
    }
  });
  handle('conference:stop-summary', async () => conferenceSummaryCmd.stopConferenceSummary());

  // Conference analysis (full paper)
  ipcMain.handle('conference:analyze-full-paper', async (_event, paperId) => {
    const controller = new AbortController();
    conferenceAnalysisCmd.setConferenceAnalysisAbortController(controller);
    try {
      const result = await conferenceAnalysisCmd.analyzeConferenceFullPaper(
        sqlConferenceDb, sqlSettingsDb, dataDir, paperId, controller.signal,
        (phase) => {
          mainWindow.webContents.send('analysis-progress', phase);
        },
      );
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      throw err;
    } finally {
      conferenceAnalysisCmd.setConferenceAnalysisAbortController(null);
    }
  });
  handle('conference:get-paper-analysis', async (paperId) =>
    conferenceAnalysisCmd.getConferencePaperAnalysis(sqlConferenceDb, dataDir, paperId),
  );
  handle('conference:stop-analysis', async () => conferenceAnalysisCmd.stopConferenceAnalysis());

  // Conference PDF
  handle('conference:download-pdf', async (paperId) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) throw new Error(`Paper ${paperId} has no PDF URL`);
    const filePath = await ensurePdfDownloaded(pdfUrl, undefined, dataDir, (loaded, total) => {
      mainWindow.webContents.send('pdf-download-progress', { paperId, loaded, total });
    });
    return filePath;
  });

  handle('conference:open-pdf', async (paperId) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, pdfUrl);
    await shell.openPath(localPath);
  });

  handle('conference:is-pdf-cached', async (paperId) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return false;
    const localPath = getPdfPath(dataDir, pdfUrl);
    try { await fs.access(localPath); return true; } catch { return false; }
  });

  handle('conference:delete-pdf', async (paperId) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, pdfUrl);
    try { await fs.unlink(localPath); } catch { /* ignore */ }
  });

  handle('conference:delete-summary', async (paperId) => {
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (category) {
      await deleteAnalysisFile(dataDir, 'summaries', category, paperId);
    }
  });

  handle('conference:delete-analysis', async (paperId) => {
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (category) {
      await deleteAnalysisFile(dataDir, 'analyses', category, paperId);
    }
  });

  // Conference Zotero export
  handle('conference:export-to-zotero', async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    const zoteroConfig = loadZoteroConfig(sqlSettingsDb);
    if (!zoteroConfig.api_key || !zoteroConfig.user_id) {
      throw new Error('Zotero API Key 和 User ID 未配置');
    }
    const results = sqlConferenceDb.exec(
      `SELECT p.id, p.title, p.authors, p.abstract, p.detail_url, p.pdf_url, p.pages,
              c.short_name, c.year, c.full_name
       FROM papers p JOIN conferences c ON p.conference_id = c.id
       WHERE p.id = ?`,
      [paperId],
    );
    if (results.length === 0 || results[0].values.length === 0) {
      throw new Error(`Conference paper ${paperId} not found`);
    }
    const row = results[0].values[0];
    const authors: string[] = JSON.parse(row[2] as string);
    const creators = authors.map(name => {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return { creatorType: 'author' as const, firstName: '', lastName: parts[0] };
      return { creatorType: 'author' as const, firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
    });

    const pdfUrl = (row[5] as string) || '';
    const shortName = row[7] as string;
    const year = row[8] as number;
    const fullName = (row[9] as string) || `${shortName} ${year}`;
    const pages = (row[6] as string) || '';
    const detailUrl = (row[4] as string) || '';

    const extraLines: string[] = [];
    if ((row[3] as string)) {
      const abstractText = (row[3] as string).substring(0, 200);
      extraLines.push(`Abstract: ${abstractText}...`);
    }

    const itemKey = await createItem(zoteroConfig.user_id, zoteroConfig.api_key, collectionKey, {
      itemType: 'conferencePaper',
      title: row[1] as string,
      abstractNote: (row[3] as string) || '',
      date: String(year),
      url: detailUrl,
      proceedingsTitle: fullName,
      conferenceName: `${shortName} ${year}`,
      pages: pages,
      repository: shortName,
      archiveID: paperId,
      extra: extraLines.join('\n'),
      creators,
      tags: [],
      collections: [],
    });

    const children: ChildItemPayload[] = [];

    if (pdfUrl) {
      const localPath = getPdfPath(dataDir, pdfUrl);
      try {
        await fs.access(localPath);
        children.push({
          itemType: 'attachment',
          parentItem: itemKey,
          linkMode: 'linked_file',
          path: localPath,
          title: 'Full Text PDF',
          contentType: 'application/pdf',
          tags: [{ tag: shortName }],
        });
      } catch { /* PDF not cached */ }
    }

    const noteParts: string[] = [];
    if (summaryHtml) noteParts.push(`<h1>论文总结</h1>${summaryHtml}`);
    if (analysisHtml) noteParts.push(`<h1>论文分析</h1>${analysisHtml}`);
    if (noteParts.length > 0) {
      children.push({
        itemType: 'note',
        parentItem: itemKey,
        note: noteParts.join('\n<hr>\n'),
        tags: [],
      });
    }

    if (children.length > 0) {
      await createChildItems(zoteroConfig.user_id, zoteroConfig.api_key, children);
    }

    return { success: true, itemKey };
  });

  // Conference import
  handle('conference:read-import-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择会议数据库文件',
      filters: [{ name: '数据库', extensions: ['db'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];

    const SQL = await initSqlJs({ locateFile: (file: string) => join(__dirname, 'wasm', file) });
    const buffer = await fs.readFile(filePath);
    const sourceDb = new SQL.Database(buffer);

    try {
      const issues = conferenceImportCmd.validateConferenceSchema(sourceDb);
      if (conferenceImportCmd.hasSchemaIssues(issues)) {
        return { filePath, valid: false, issues };
      }
      const conferences = conferenceImportCmd.listSourceConferences(sourceDb);
      return { filePath, valid: true, conferences };
    } finally {
      sourceDb.close();
    }
  });

  handle('conference:check-conflicts', async (filePath: string, selectedIds: number[]) => {
    const SQL = await initSqlJs({ locateFile: (file: string) => join(__dirname, 'wasm', file) });
    const buffer = await fs.readFile(filePath);
    const sourceDb = new SQL.Database(buffer);

    try {
      let conferences = conferenceImportCmd.listSourceConferences(sourceDb);
      const idSet = new Set(selectedIds);
      conferences = conferences.filter(c => idSet.has(c.id));
      const conflicts = conferenceImportCmd.findConflicts(sqlConferenceDb, conferences);
      return conflicts;
    } finally {
      sourceDb.close();
    }
  });

  handle('conference:import', async (options: { filePath: string; resolutions: conferenceImportCmd.ConflictResolution[]; selectedConferenceIds?: number[] }) => {
    const dbPath = join(dataDir, 'conference_papers.db');
    let backupPath: string | null = null;

    try {
      if (fsSync.existsSync(dbPath)) {
        backupPath = await conferenceImportCmd.backupConferenceDb(dbPath);
      }

      const result = await conferenceImportCmd.importFromExternalDb(
        options.filePath, sqlConferenceDb, options.resolutions, dataDir, options.selectedConferenceIds,
      );

      if (result.success) {
        await conferenceDb.save();
        rebuildConferenceTopics.rebuildConferencePaperTopics(sqlConferenceDb, sqlPaperTopicsDb);
        await paperTopicsDb.save();
        if (backupPath) await conferenceImportCmd.removeBackup(backupPath);
      } else {
        if (backupPath) await conferenceImportCmd.restoreConferenceDb(backupPath, dbPath);
      }

      return result;
    } catch (err) {
      if (backupPath) {
        try { await conferenceImportCmd.restoreConferenceDb(backupPath, dbPath); } catch {}
      }
      throw err;
    }
  });

  handle('open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return undefined;
    return result.filePaths[0];
  });
}
