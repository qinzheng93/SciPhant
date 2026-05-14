import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Paper (arXiv)
  listArxivPapers: (params: unknown) => ipcRenderer.invoke('arxiv:list-papers', params),
  listArxivFetchDates: () => ipcRenderer.invoke('arxiv:list-fetch-dates'),
  checkArxivSummaryStatus: (ids: string[]) => ipcRenderer.invoke('arxiv:check-papers-summary-status', ids),
  getArxivSummary: (id: string) => ipcRenderer.invoke('arxiv:get-paper-summary', id),

  // Config
  listTopics: () => ipcRenderer.invoke('list-topics'),
  saveTopic: (topic: unknown) => ipcRenderer.invoke('save-topic', topic),
  deleteTopic: (id: number) => ipcRenderer.invoke('delete-topic', id),
  rebuildPaperTopics: () => ipcRenderer.invoke('rebuild-paper-topics'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: unknown) => ipcRenderer.invoke('update-config', config),
  listCategories: () => ipcRenderer.invoke('list-categories'),
  saveCategory: (category: unknown) => ipcRenderer.invoke('save-category', category),
  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', id),
  clearData: () => ipcRenderer.invoke('clear-data'),
  clearAnalyses: () => ipcRenderer.invoke('clear-analyses'),

  // Data directory
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  setDataDir: () => ipcRenderer.invoke('set-data-dir'),
  resetDataDir: () => ipcRenderer.invoke('reset-data-dir'),

  // Fetch (arXiv)
  fetchArxivPapers: (categories?: string[]) => ipcRenderer.invoke('arxiv:fetch-papers', categories),
  fetchArxivPapersThisWeek: (categories?: string[]) => ipcRenderer.invoke('arxiv:fetch-papers-this-week', categories),
  fetchArxivPapersByDate: (params: unknown) => ipcRenderer.invoke('arxiv:fetch-papers-by-date', params),
  fetchArxivPapersByIds: (input: string) => ipcRenderer.invoke('arxiv:fetch-single-paper', input),

  // Summary (arXiv)
  summarizeArxivPaper: (id: string, skipIfAnalyzed?: boolean) => ipcRenderer.invoke('arxiv:summarize-paper', id, skipIfAnalyzed),
  stopArxivSummary: () => ipcRenderer.invoke('arxiv:stop-summary'),
  testLLMConnection: () => ipcRenderer.invoke('test-llm-connection'),
  testZoteroConnection: () => ipcRenderer.invoke('test-zotero-connection'),

  // PDF download (arXiv)
  downloadArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:download-pdf', id),
  openArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:open-pdf', id),
  isArxivPdfCached: (id: string) => ipcRenderer.invoke('arxiv:is-pdf-cached', id),
  deleteArxivPdf: (id: string) => ipcRenderer.invoke('arxiv:delete-pdf', id),
  deleteArxivSummary: (id: string) => ipcRenderer.invoke('arxiv:delete-summary', id),
  deleteArxivAnalysis: (id: string) => ipcRenderer.invoke('arxiv:delete-analysis', id),
  onPdfDownloadProgress: (callback: (data: { paperId: string; loaded: number; total?: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { paperId: string; loaded: number; total?: number }) => {
      callback(data);
    };
    ipcRenderer.on('pdf-download-progress', handler);
    return () => ipcRenderer.removeListener('pdf-download-progress', handler);
  },

  // Zotero
  listZoteroCollections: () => ipcRenderer.invoke('list-zotero-collections'),
  exportPaperToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => ipcRenderer.invoke('export-paper-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml),

  // Analysis (arXiv full paper)
  analyzeArxivFullPaper: (id: string) => ipcRenderer.invoke('arxiv:analyze-full-paper', id),
  getArxivAnalysis: (id: string) => ipcRenderer.invoke('arxiv:get-paper-analysis', id),
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
  listConferencePapers: (params: unknown) => ipcRenderer.invoke('conference:list-papers', params),
  listConferenceTracks: (conferenceId: number) => ipcRenderer.invoke('conference:list-tracks', conferenceId),
  conferenceCheckPapersSummaryStatus: (ids: string[]) => ipcRenderer.invoke('conference:check-papers-summary-status', ids),
  conferenceGetPaperSummary: (id: string) => ipcRenderer.invoke('conference:get-paper-summary', id),
  conferenceSummarizePaper: (id: string, skipIfAnalyzed?: boolean) => ipcRenderer.invoke('conference:summarize-paper', id, skipIfAnalyzed),
  conferenceStopSummary: () => ipcRenderer.invoke('conference:stop-summary'),
  conferenceAnalyzeFullPaper: (id: string) => ipcRenderer.invoke('conference:analyze-full-paper', id),
  conferenceGetPaperAnalysis: (id: string) => ipcRenderer.invoke('conference:get-paper-analysis', id),
  conferenceStopAnalysis: () => ipcRenderer.invoke('conference:stop-analysis'),
  conferenceDownloadPdf: (id: string) => ipcRenderer.invoke('conference:download-pdf', id),
  conferenceOpenPdf: (id: string) => ipcRenderer.invoke('conference:open-pdf', id),
  conferenceIsPdfCached: (id: string) => ipcRenderer.invoke('conference:is-pdf-cached', id),
  conferenceDeletePdf: (id: string) => ipcRenderer.invoke('conference:delete-pdf', id),
  conferenceDeleteSummary: (id: string) => ipcRenderer.invoke('conference:delete-summary', id),
  conferenceDeleteAnalysis: (id: string) => ipcRenderer.invoke('conference:delete-analysis', id),
  conferenceExportToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => ipcRenderer.invoke('conference:export-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml),

  // Conference import
  conferenceReadImportFile: () => ipcRenderer.invoke('conference:read-import-file'),
  conferenceCheckConflicts: (filePath: string, selectedIds: number[]) => ipcRenderer.invoke('conference:check-conflicts', filePath, selectedIds),
  conferenceImport: (options: unknown) => ipcRenderer.invoke('conference:import', options),
};

contextBridge.exposeInMainWorld('api', api);
