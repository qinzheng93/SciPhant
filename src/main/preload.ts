import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/ipc-api.js';

const api: ElectronAPI = {
  // Paper (arXiv)
  listArxivPapers: (params) => ipcRenderer.invoke('arxiv:list-papers', params),
  listArxivFetchDates: () => ipcRenderer.invoke('arxiv:list-fetch-dates'),
  checkArxivSummaryStatus: (ids) => ipcRenderer.invoke('arxiv:check-papers-summary-status', ids),
  getArxivSummary: (id) => ipcRenderer.invoke('arxiv:get-paper-summary', id),

  // Config
  listTopics: () => ipcRenderer.invoke('list-topics'),
  saveTopic: (topic) => ipcRenderer.invoke('save-topic', topic),
  deleteTopic: (id) => ipcRenderer.invoke('delete-topic', id),
  rebuildPaperTopics: () => ipcRenderer.invoke('rebuild-paper-topics'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  listCategories: () => ipcRenderer.invoke('list-categories'),
  saveCategory: (category) => ipcRenderer.invoke('save-category', category),
  deleteCategory: (id) => ipcRenderer.invoke('delete-category', id),
  clearData: () => ipcRenderer.invoke('clear-data'),
  clearAnalyses: () => ipcRenderer.invoke('clear-analyses'),

  // Data directory
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  setDataDir: () => ipcRenderer.invoke('set-data-dir'),
  resetDataDir: () => ipcRenderer.invoke('reset-data-dir'),

  // Fetch (arXiv)
  fetchArxivPapers: (categories) => ipcRenderer.invoke('arxiv:fetch-papers', categories),
  fetchArxivPapersThisWeek: (categories) => ipcRenderer.invoke('arxiv:fetch-papers-this-week', categories),
  fetchArxivPapersByDate: (params) => ipcRenderer.invoke('arxiv:fetch-papers-by-date', params),
  fetchArxivPapersByIds: (input) => ipcRenderer.invoke('arxiv:fetch-single-paper', input),

  // Summary (arXiv)
  summarizeArxivPaper: (id, skipIfAnalyzed) => ipcRenderer.invoke('arxiv:summarize-paper', id, skipIfAnalyzed),
  stopArxivSummary: () => ipcRenderer.invoke('arxiv:stop-summary'),
  testLLMConnection: () => ipcRenderer.invoke('test-llm-connection'),

  // PDF download (arXiv)
  downloadArxivPdf: (id) => ipcRenderer.invoke('arxiv:download-pdf', id),
  openArxivPdf: (id) => ipcRenderer.invoke('arxiv:open-pdf', id),
  isArxivPdfCached: (id) => ipcRenderer.invoke('arxiv:is-pdf-cached', id),
  deleteArxivPdf: (id) => ipcRenderer.invoke('arxiv:delete-pdf', id),
  deleteArxivSummary: (id) => ipcRenderer.invoke('arxiv:delete-summary', id),
  deleteArxivAnalysis: (id) => ipcRenderer.invoke('arxiv:delete-analysis', id),
  onPdfDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { paperId: string; loaded: number; total?: number }) => {
      callback(data);
    };
    ipcRenderer.on('pdf-download-progress', handler);
    return () => ipcRenderer.removeListener('pdf-download-progress', handler);
  },

  // Zotero
  listZoteroCollections: () => ipcRenderer.invoke('list-zotero-collections'),
  exportPaperToZotero: (paperId, collectionKey, summaryHtml, analysisHtml) =>
    ipcRenderer.invoke('export-paper-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml),

  // Analysis (arXiv full paper)
  analyzeArxivFullPaper: (id) => ipcRenderer.invoke('arxiv:analyze-full-paper', id),
  getArxivAnalysis: (id) => ipcRenderer.invoke('arxiv:get-paper-analysis', id),
  stopArxivAnalysis: () => ipcRenderer.invoke('arxiv:stop-analysis'),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('open-directory'),

  // Events
  onAnalysisProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data as string);
    };
    ipcRenderer.on('analysis-progress', handler);
    return () => ipcRenderer.removeListener('analysis-progress', handler);
  },

  // Conference
  listConferences: () => ipcRenderer.invoke('conference:list-conferences'),
  listConferencePapers: (params) => ipcRenderer.invoke('conference:list-papers', params),
  listConferenceTracks: (conferenceId) => ipcRenderer.invoke('conference:list-tracks', conferenceId),
  conferenceCheckPapersSummaryStatus: (ids) => ipcRenderer.invoke('conference:check-papers-summary-status', ids),
  conferenceGetPaperSummary: (id) => ipcRenderer.invoke('conference:get-paper-summary', id),
  conferenceSummarizePaper: (id, skipIfAnalyzed) => ipcRenderer.invoke('conference:summarize-paper', id, skipIfAnalyzed),
  conferenceStopSummary: () => ipcRenderer.invoke('conference:stop-summary'),
  conferenceAnalyzeFullPaper: (id) => ipcRenderer.invoke('conference:analyze-full-paper', id),
  conferenceGetPaperAnalysis: (id) => ipcRenderer.invoke('conference:get-paper-analysis', id),
  conferenceStopAnalysis: () => ipcRenderer.invoke('conference:stop-analysis'),
  conferenceDownloadPdf: (id) => ipcRenderer.invoke('conference:download-pdf', id),
  conferenceOpenPdf: (id) => ipcRenderer.invoke('conference:open-pdf', id),
  conferenceIsPdfCached: (id) => ipcRenderer.invoke('conference:is-pdf-cached', id),
  conferenceDeletePdf: (id) => ipcRenderer.invoke('conference:delete-pdf', id),
  conferenceDeleteSummary: (id) => ipcRenderer.invoke('conference:delete-summary', id),
  conferenceDeleteAnalysis: (id) => ipcRenderer.invoke('conference:delete-analysis', id),
  conferenceExportToZotero: (paperId, collectionKey, summaryHtml, analysisHtml) =>
    ipcRenderer.invoke('conference:export-to-zotero', paperId, collectionKey, summaryHtml, analysisHtml),

  // Conference import
  conferenceReadImportFile: () => ipcRenderer.invoke('conference:read-import-file'),
  conferenceCheckConflicts: (filePath, selectedIds) => ipcRenderer.invoke('conference:check-conflicts', filePath, selectedIds),
  conferenceImport: (options) => ipcRenderer.invoke('conference:import', options),
};

contextBridge.exposeInMainWorld('api', api);
