import { ipcMain, dialog, app, shell } from 'electron';
import * as fs from 'fs/promises';
import { join } from 'path';
import type { BrowserWindow } from 'electron';
import type { Database } from './database/connection.js';
import type { SettingsDb } from './database/settings.js';
import type { PaperTopicsDb } from './database/paper-topics.js';
import * as arxivPaperCmd from './commands/arxiv-paper.js';
import * as configCmd from './commands/config.js';
import * as arxivFetchCmd from './commands/arxiv-fetch.js';
import * as arxivSummaryCmd from './commands/arxiv-summary.js';
import * as arxivAnalysisCmd from './commands/arxiv-analysis.js';
import * as llmCmd from './commands/llm.js';
import * as rebuildArxivTopics from './commands/rebuild-arxiv-topics.js';
import * as rebuildConferenceTopics from './commands/rebuild-conference-topics.js';
import * as conferencePaperCmd from './commands/conference-paper.js';
import * as conferenceSummaryCmd from './commands/conference-summary.js';
import * as conferenceAnalysisCmd from './commands/conference-analysis.js';
import * as conferenceImportCmd from './commands/conference-import.js';
import * as fsSync from 'fs';
import { getSqlJs } from './database/connection.js';
import type * as IPC from '../shared/ipc-api.js';
import { ensurePdfDownloaded, getPdfPath } from './services/pdf-extractor.js';
import { pingZotero, getConnectorCollections, parseCreators, buildNotes, exportToZotero, type ConnectorItem } from './services/zotero-client.js';
import { saveDataDir, resetDataDir } from './commands/config.js';
import {
  deleteAnalysisFile,
  clearAllAnalysisFiles,
} from './services/analysis-files.js';
import { checkArxivSummaryStatus, getArxivSummaryContent } from './commands/arxiv-summary.js';
import {
  getCategoryForConference,
  checkConferenceSummaryStatus,
  getConferenceSummaryContent,
} from './commands/conference-summary.js';

function handle(channel: string, fn: (...args: any[]) => Promise<any>) {
  ipcMain.handle(channel, async (_event, ...args) => {
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

  // Safe send to renderer — guards against destroyed window
  function sendToRenderer(channel: string, ...args: unknown[]): void {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  }

  // Serial queue for topic association updates
  let topicQueueChain = Promise.resolve();
  const enqueueTopicUpdate = (fn: () => void) => {
    topicQueueChain = topicQueueChain.then(fn, (err) => {
      console.error('[topicQueue] Previous task failed:', err);
      fn();
    });
    return topicQueueChain;
  };

  // Paper (read-only)
  handle('arxiv:list-papers', async (params: { topicIds?: number[]; topicId?: number; search?: string; fetchDate?: string; page?: number; pageSize?: number }) => arxivPaperCmd.listArxivPapers(sqlArxivDb, sqlPaperTopicsDb, params));
  handle('arxiv:list-fetch-dates', async () => arxivPaperCmd.listArxivFetchDates(sqlArxivDb));
  handle('arxiv:check-papers-summary-status', async (paperIds: string[]) => checkArxivSummaryStatus(dataDir, paperIds));
  handle('arxiv:get-paper-summary', async (paperId: string) => getArxivSummaryContent(dataDir, paperId));

  // Config
  handle('list-topics', async () => configCmd.listTopics(sqlPaperTopicsDb));
  handle('save-topic', async (topic: { id?: number; name: string; keywords: string[]; enabled: boolean }) => {
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
  handle('delete-topic', async (topicId: number) => {
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
  handle('update-config', async (config: { llm: IPC.LLMConfig; output: IPC.OutputConfig; theme?: string }) => {
    configCmd.updateConfig(sqlSettingsDb, config.llm, config.output, config.theme);
    await settingsDb.save();
  });
  handle('list-categories', async () => configCmd.listCategories(sqlArxivDb));
  handle('save-category', async (category: { id?: number; name: string; enabled: boolean }) => {
    const result = configCmd.saveCategory(sqlArxivDb, category);
    await arxivDb.save();
    return result;
  });
  handle('delete-category', async (categoryId: number) => {
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

  // Fetch
  handle('arxiv:fetch-papers', async (categories?: string[]) => {
    const result = await arxivFetchCmd.fetchArxivPapers(sqlArxivDb, sqlPaperTopicsDb, categories || []);
    await arxivDb.save();
    await paperTopicsDb.save();
    return result;
  });
  handle('arxiv:fetch-papers-this-week', async (categories?: string[]) => {
    const result = await arxivFetchCmd.fetchArxivPapersThisWeek(sqlArxivDb, sqlPaperTopicsDb, categories || []);
    await arxivDb.save();
    await paperTopicsDb.save();
    return result;
  });
  ipcMain.handle('arxiv:fetch-papers-by-date', async (_event, params: { startDate: string; endDate: string; categories?: string[] }) => {
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
  ipcMain.handle('arxiv:summarize-paper', async (_event, paperId: string, skipIfAnalyzed?: boolean) => {
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
  handle('arxiv:download-pdf', async (paperId: string) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) {
      throw new Error(`Paper ${paperId} not found`);
    }
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) {
      throw new Error(`Paper ${paperId} has no PDF URL`);
    }
    const filePath = await ensurePdfDownloaded(pdfUrl, undefined, dataDir, 'arXiv', paperId, (loaded, total) => {
      sendToRenderer('pdf-download-progress', { paperId, loaded, total });
    });
    return filePath;
  });

  handle('arxiv:open-pdf', async (paperId: string) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, 'arXiv', paperId);
    await shell.openPath(localPath);
  });

  handle('arxiv:is-pdf-cached', async (paperId: string) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return false;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return false;
    const localPath = getPdfPath(dataDir, 'arXiv', paperId);
    try {
      await fs.access(localPath);
      return true;
    } catch {
      return false;
    }
  });

  handle('arxiv:delete-pdf', async (paperId: string) => {
    const results = sqlArxivDb.exec('SELECT pdf_url FROM papers WHERE id = ?', [paperId]);
    if (results.length === 0 || results[0].values.length === 0) return;
    const pdfUrl = results[0].values[0][0] as string;
    if (!pdfUrl) return;
    const localPath = getPdfPath(dataDir, 'arXiv', paperId);
    try {
      await fs.unlink(localPath);
    } catch { /* ignore */ }
  });

  handle('arxiv:delete-summary', async (paperId: string) => {
    await deleteAnalysisFile(dataDir, 'summaries', 'arXiv', paperId);
  });

  handle('arxiv:delete-analysis', async (paperId: string) => {
    await deleteAnalysisFile(dataDir, 'analyses', 'arXiv', paperId);
  });

  // Analysis (full paper)
  ipcMain.handle('arxiv:analyze-full-paper', async (_event, paperId: string) => {
    const controller = new AbortController();
    arxivAnalysisCmd.setArxivAnalysisAbortController(controller);
    try {
      const result = await arxivAnalysisCmd.analyzeArxivFullPaper(sqlArxivDb, sqlSettingsDb, dataDir, paperId, controller.signal, (phase) => {
        sendToRenderer('analysis-progress', phase);
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
  handle('arxiv:get-paper-analysis', async (paperId: string) => arxivAnalysisCmd.getArxivPaperAnalysis(dataDir, paperId));
  handle('arxiv:stop-analysis', async () => arxivAnalysisCmd.stopArxivAnalysis());

  // Zotero
  handle('list-zotero-collections', async () => {
    const running = await pingZotero();
    if (!running) {
      throw new Error('Zotero 未运行，请先启动 Zotero 桌面应用');
    }
    return getConnectorCollections();
  });

  handle('export-paper-to-zotero', async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    const running = await pingZotero();
    if (!running) {
      throw new Error('Zotero 未运行，请先启动 Zotero 桌面应用');
    }

    const results = sqlArxivDb.exec(
      'SELECT id, title, authors, abstract, url, pdf_url, published_date, categories FROM papers WHERE id = ?',
      [paperId],
    );
    if (results.length === 0 || results[0].values.length === 0) {
      throw new Error(`Paper ${paperId} not found`);
    }
    const row = results[0].values[0];

    const arxivId = (row[0] as string).replace(/v\d+$/, '');
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
      archiveID: `arXiv:${arxivId}`,
      extra: extraLines.join('\n'),
      creators: parseCreators(JSON.parse(row[2] as string)),
      tags: [],
      notes: buildNotes(summaryHtml, analysisHtml).map(n => ({ note: n })),
      attachments: [],
      seeAlso: [],
    };

    const pdfUrl = (row[5] as string) || '';
    return exportToZotero(item, pdfUrl, 'arXiv', paperId, collectionKey, dataDir);
  });

  // ── Conference mode ──

  // Conference papers (read-only from bundled DB)
  handle('conference:list-conferences', async () => conferencePaperCmd.listConferences(sqlConferenceDb));
  handle('conference:list-papers', async (params: { conferenceId?: number | null; search?: string; tracks?: string[]; topicIds?: number[]; page?: number; pageSize?: number }) =>
    conferencePaperCmd.listConferencePapers(sqlConferenceDb, sqlArxivDb, sqlPaperTopicsDb, params),
  );
  handle('conference:check-papers-summary-status', async (paperIds: string[]) =>
    checkConferenceSummaryStatus(sqlConferenceDb, dataDir, paperIds),
  );
  handle('conference:get-paper-summary', async (paperId: string) =>
    getConferenceSummaryContent(sqlConferenceDb, dataDir, paperId),
  );
  handle('conference:list-tracks', async (conferenceId: number) =>
    conferencePaperCmd.listConferenceTracks(sqlConferenceDb, conferenceId),
  );

  // Conference summary
  ipcMain.handle('conference:summarize-paper', async (_event, paperId: string, skipIfAnalyzed?: boolean) => {
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
  ipcMain.handle('conference:analyze-full-paper', async (_event, paperId: string) => {
    const controller = new AbortController();
    conferenceAnalysisCmd.setConferenceAnalysisAbortController(controller);
    try {
      const result = await conferenceAnalysisCmd.analyzeConferenceFullPaper(
        sqlConferenceDb, sqlSettingsDb, dataDir, paperId, controller.signal,
        (phase) => {
          sendToRenderer('analysis-progress', phase);
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
  handle('conference:get-paper-analysis', async (paperId: string) =>
    conferenceAnalysisCmd.getConferencePaperAnalysis(sqlConferenceDb, dataDir, paperId),
  );
  handle('conference:stop-analysis', async () => conferenceAnalysisCmd.stopConferenceAnalysis());

  // Conference PDF
  handle('conference:download-pdf', async (paperId: string) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) throw new Error(`Paper ${paperId} has no PDF URL`);
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (!category) throw new Error(`Conference category not found for paper ${paperId}`);
    const filePath = await ensurePdfDownloaded(pdfUrl, undefined, dataDir, category, paperId, (loaded, total) => {
      sendToRenderer('pdf-download-progress', { paperId, loaded, total });
    });
    return filePath;
  });

  handle('conference:open-pdf', async (paperId: string) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return;
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (!category) return;
    const localPath = getPdfPath(dataDir, category, paperId);
    await shell.openPath(localPath);
  });

  handle('conference:is-pdf-cached', async (paperId: string) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return false;
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (!category) return false;
    const localPath = getPdfPath(dataDir, category, paperId);
    try { await fs.access(localPath); return true; } catch { return false; }
  });

  handle('conference:delete-pdf', async (paperId: string) => {
    const pdfUrl = conferencePaperCmd.getConferencePaperPdfUrl(sqlConferenceDb, paperId);
    if (!pdfUrl) return;
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (!category) return;
    const localPath = getPdfPath(dataDir, category, paperId);
    try { await fs.unlink(localPath); } catch { /* ignore */ }
  });

  handle('conference:delete-summary', async (paperId: string) => {
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (category) {
      await deleteAnalysisFile(dataDir, 'summaries', category, paperId);
    }
  });

  handle('conference:delete-analysis', async (paperId: string) => {
    const category = getCategoryForConference(sqlConferenceDb, paperId);
    if (category) {
      await deleteAnalysisFile(dataDir, 'analyses', category, paperId);
    }
  });

  // Conference Zotero export
  handle('conference:export-to-zotero', async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    const running = await pingZotero();
    if (!running) {
      throw new Error('Zotero 未运行，请先启动 Zotero 桌面应用');
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
      archiveID: paperId,
      creators: parseCreators(JSON.parse(row[2] as string)),
      tags: [],
      notes: buildNotes(summaryHtml, analysisHtml).map(n => ({ note: n })),
      attachments: [],
      seeAlso: [],
    };

    const pdfUrl = (row[5] as string) || '';
    const category = `${shortName}${year}`;
    return exportToZotero(item, pdfUrl, category, paperId, collectionKey, dataDir);
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

    const SQL = await getSqlJs();
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
    const SQL = await getSqlJs();
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

  handle('conference:import', async (options: { filePath: string; resolutions: IPC.ConflictResolution[]; selectedConferenceIds?: number[] }) => {
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
