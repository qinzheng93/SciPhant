import { contextBridge, ipcRenderer } from 'electron';

// ── Runtime validation helpers ──

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const isNumArr = (v: unknown): v is number[] => Array.isArray(v) && v.every(x => typeof x === 'number');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function assertType<T>(value: unknown, check: (v: unknown) => v is T, label: string): T {
  if (!check(value)) throw new Error(`Invalid ${label}`);
  return value;
}

const api = {
  // Paper (arXiv)
  listArxivPapers: (params: unknown) => ipcRenderer.invoke('arxiv:list-papers', assertType(params, isObj, 'params')),
  listArxivFetchDates: () => ipcRenderer.invoke('arxiv:list-fetch-dates'),
  checkArxivSummaryStatus: (ids: string[]) => ipcRenderer.invoke('arxiv:check-papers-summary-status', assertType(ids, isStrArr, 'ids')),
  getArxivSummary: (id: string) => ipcRenderer.invoke('arxiv:get-paper-summary', assertType(id, isStr, 'id')),

  // Config
  listTopics: () => ipcRenderer.invoke('list-topics'),
  saveTopic: (topic: unknown) => {
    const t = assertType(topic, isObj, 'topic');
    assertType(t.name, isStr, 'topic.name');
    if (!Array.isArray(t.keywords)) throw new Error('Invalid topic.keywords');
    return ipcRenderer.invoke('save-topic', t);
  },
  deleteTopic: (id: number) => ipcRenderer.invoke('delete-topic', assertType(id, isNum, 'id')),
  rebuildPaperTopics: () => ipcRenderer.invoke('rebuild-paper-topics'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: unknown) => ipcRenderer.invoke('update-config', assertType(config, isObj, 'config')),
  listCategories: () => ipcRenderer.invoke('list-categories'),
  saveCategory: (category: unknown) => {
    const c = assertType(category, isObj, 'category');
    assertType(c.name, isStr, 'category.name');
    return ipcRenderer.invoke('save-category', c);
  },
  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', assertType(id, isNum, 'id')),
  clearData: () => ipcRenderer.invoke('clear-data'),
  clearAnalyses: () => ipcRenderer.invoke('clear-analyses'),

  // Data directory
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  setDataDir: () => ipcRenderer.invoke('set-data-dir'),
  resetDataDir: () => ipcRenderer.invoke('reset-data-dir'),

  // Fetch (arXiv)
  fetchArxivPapers: (categories?: string[]) => {
    if (categories !== undefined) assertType(categories, isStrArr, 'categories');
    return ipcRenderer.invoke('arxiv:fetch-papers', categories);
  },
  fetchArxivPapersThisWeek: (categories?: string[]) => {
    if (categories !== undefined) assertType(categories, isStrArr, 'categories');
    return ipcRenderer.invoke('arxiv:fetch-papers-this-week', categories);
  },
  fetchArxivPapersByDate: (params: unknown) => {
    const p = assertType(params, isObj, 'params');
    assertType(p.startDate, isStr, 'startDate');
    assertType(p.endDate, isStr, 'endDate');
    return ipcRenderer.invoke('arxiv:fetch-papers-by-date', p);
  },
  fetchArxivPapersByIds: (input: string) => ipcRenderer.invoke('arxiv:fetch-single-paper', assertType(input, isStr, 'input')),

  // Summary (arXiv)
  summarizeArxivPaper: (id: string, skipIfAnalyzed?: boolean) => ipcRenderer.invoke('arxiv:summarize-paper', assertType(id, isStr, 'id'), skipIfAnalyzed),
  stopArxivSummary: () => ipcRenderer.invoke('arxiv:stop-summary'),
  testLLMConnection: () => ipcRenderer.invoke('test-llm-connection'),
  testZoteroConnection: () => ipcRenderer.invoke('test-zotero-connection'),

  // PDF download (arXiv)
  downloadArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:download-pdf', assertType(id, isStr, 'id')),
  openArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:open-pdf', assertType(id, isStr, 'id')),
  isArxivPdfCached: (id: string) => ipcRenderer.invoke('arxiv:is-pdf-cached', assertType(id, isStr, 'id')),
  deleteArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:delete-pdf', assertType(id, isStr, 'id')),
  deleteArxivSummary: (id: string) => ipcRenderer.invoke('arxiv:delete-summary', assertType(id, isStr, 'id')),
  deleteArxivAnalysis: (id: string) => ipcRenderer.invoke('arxiv:delete-analysis', assertType(id, isStr, 'id')),
  onPdfDownloadProgress: (callback: (data: { paperId: string; loaded: number; total?: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { paperId: string; loaded: number; total?: number }) => {
      callback(data);
    };
    ipcRenderer.on('pdf-download-progress', handler);
    return () => ipcRenderer.removeListener('pdf-download-progress', handler);
  },

  // Zotero
  listZoteroCollections: () => ipcRenderer.invoke('list-zotero-collections'),
  exportPaperToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    assertType(paperId, isStr, 'paperId');
    assertType(collectionKey, isStr, 'collectionKey');
    return ipcRenderer.invoke('export-paper-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml);
  },

  // Analysis (arXiv full paper)
  analyzeArxivFullPaper: (id: string) => ipcRenderer.invoke('arxiv:analyze-full-paper', assertType(id, isStr, 'id')),
  getArxivAnalysis: (id: string) => ipcRenderer.invoke('arxiv:get-paper-analysis', assertType(id, isStr, 'id')),
  stopArxivAnalysis: () => ipcRenderer.invoke('arxiv:stop-analysis'),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('open-directory'),

  // Events
  onSummaryProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on('summary-progress', handler);
    return () => ipcRenderer.removeListener('summary-progress', handler);
  },
  onAnalysisProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on('analysis-progress', handler);
    return () => ipcRenderer.removeListener('analysis-progress', handler);
  },

  // Conference
  listConferences: () => ipcRenderer.invoke('conference:list-conferences'),
  listConferencePapers: (params: unknown) => ipcRenderer.invoke('conference:list-papers', assertType(params, isObj, 'params')),
  listConferenceTracks: (conferenceId: number) => ipcRenderer.invoke('conference:list-tracks', assertType(conferenceId, isNum, 'conferenceId')),
  conferenceCheckPapersSummaryStatus: (ids: string[]) => ipcRenderer.invoke('conference:check-papers-summary-status', assertType(ids, isStrArr, 'ids')),
  conferenceGetPaperSummary: (id: string) => ipcRenderer.invoke('conference:get-paper-summary', assertType(id, isStr, 'id')),
  conferenceSummarizePaper: (id: string, skipIfAnalyzed?: boolean) => ipcRenderer.invoke('conference:summarize-paper', assertType(id, isStr, 'id'), skipIfAnalyzed),
  conferenceStopSummary: () => ipcRenderer.invoke('conference:stop-summary'),
  conferenceAnalyzeFullPaper: (id: string) => ipcRenderer.invoke('conference:analyze-full-paper', assertType(id, isStr, 'id')),
  conferenceGetPaperAnalysis: (id: string) => ipcRenderer.invoke('conference:get-paper-analysis', assertType(id, isStr, 'id')),
  conferenceStopAnalysis: () => ipcRenderer.invoke('conference:stop-analysis'),
  conferenceDownloadPdf: (id: string) => ipcRenderer.invoke('conference:download-pdf', assertType(id, isStr, 'id')),
  conferenceOpenPdf: (id: string) => ipcRenderer.invoke('conference:open-pdf', assertType(id, isStr, 'id')),
  conferenceIsPdfCached: (id: string) => ipcRenderer.invoke('conference:is-pdf-cached', assertType(id, isStr, 'id')),
  conferenceDeletePdf: (id: string) => ipcRenderer.invoke('conference:delete-pdf', assertType(id, isStr, 'id')),
  conferenceDeleteSummary: (id: string) => ipcRenderer.invoke('conference:delete-summary', assertType(id, isStr, 'id')),
  conferenceDeleteAnalysis: (id: string) => ipcRenderer.invoke('conference:delete-analysis', assertType(id, isStr, 'id')),
  conferenceExportToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => {
    assertType(paperId, isStr, 'paperId');
    assertType(collectionKey, isStr, 'collectionKey');
    return ipcRenderer.invoke('conference:export-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml);
  },

  // Conference import
  conferenceReadImportFile: () => ipcRenderer.invoke('conference:read-import-file'),
  conferenceCheckConflicts: (filePath: string, selectedIds: number[]) => {
    assertType(filePath, isStr, 'filePath');
    assertType(selectedIds, isNumArr, 'selectedIds');
    return ipcRenderer.invoke('conference:check-conflicts', filePath, selectedIds);
  },
  conferenceImport: (options: unknown) => {
    const o = assertType(options, isObj, 'options');
    assertType(o.filePath, isStr, 'filePath');
    return ipcRenderer.invoke('conference:import', o);
  },
};

contextBridge.exposeInMainWorld('api', api);
