// Single source of truth for all IPC types.
// Used by both renderer (env.d.ts) and main process (preload.ts).

// ── Data types ──

export interface ArxivPaper {
  id: string
  title: string
  authors: string[]
  abstract: string
  url: string
  pdf_url: string
  published_date: string
  updated_date: string
  categories: string[]
  fetched_at: string
}

export interface ConferencePaper {
  id: string
  conference_id: number
  short_name: string
  year: number
  full_name: string
  title: string
  authors: string[]
  abstract: string
  pdf_url: string | null
  supp_url: string | null
  arxiv_url: string | null
  bibtex: string | null
  pages: string | null
  track: string | null
  detail_url: string | null
}

export interface ConferenceInfo {
  id: number
  short_name: string
  year: number
  full_name: string | null
  paper_count: number
}

export interface Topic {
  id: number
  name: string
  keywords: string[]
  enabled: boolean
}

export interface Category {
  id: number
  name: string
  enabled: boolean
}

export interface LLMConfig {
  api_key: string
  base_url: string
  model: string
  temperature: number
}

export interface OutputConfig {
  output_dir: string
  auto_save: boolean
}

export interface ZoteroConfig {
  api_key: string
  user_id: string
}

// ── API interface ──

export interface ElectronAPI {
  // Paper
  listArxivPapers: (params: {
    topicIds?: number[]
    search?: string
    fetchDate?: string
    page?: number
    pageSize?: number
  }) => Promise<{ items: ArxivPaper[]; total: number; page: number; page_size: number }>
  listArxivFetchDates: () => Promise<{ date: string; display: string; count: number }[]>
  checkArxivSummaryStatus: (ids: string[]) => Promise<Record<string, boolean>>
  getArxivSummary: (id: string) => Promise<string | null>

  // Config
  listTopics: () => Promise<Topic[]>
  saveTopic: (topic: { id?: number; name: string; keywords: string[]; enabled: boolean }) => Promise<Topic | { error: string }>
  deleteTopic: (topicId: number) => Promise<void>
  rebuildPaperTopics: () => Promise<{ success: boolean; count: number }>
  getConfig: () => Promise<{ llm: LLMConfig; output: OutputConfig; zotero?: ZoteroConfig; theme?: string }>
  updateConfig: (config: { llm: LLMConfig; output: OutputConfig; zotero?: ZoteroConfig; theme?: string }) => Promise<void>
  listCategories: () => Promise<Category[]>
  saveCategory: (category: { id?: number; name: string; enabled: boolean }) => Promise<Category>
  deleteCategory: (categoryId: number) => Promise<void>
  clearData: () => Promise<{ success: boolean }>
  clearAnalyses: () => Promise<{ success: boolean }>

  // Data directory
  getDataDir: () => Promise<string>
  setDataDir: () => Promise<{ success: boolean; error?: string }>
  resetDataDir: () => Promise<{ success: boolean }>

  // Fetch
  fetchArxivPapers: (categories?: string[]) => Promise<{
    success: boolean; new_count: number; existing_count: number
    failed_categories: string[]; failed_details: { category: string; error: string }[]
  }>
  fetchArxivPapersThisWeek: (categories?: string[]) => Promise<{
    success: boolean; new_count: number; existing_count: number
    failed_categories: string[]; failed_details: { category: string; error: string }[]
  }>
  fetchArxivPapersByDate: (params: { startDate: string; endDate: string; categories?: string[] }) => Promise<{
    success: boolean; local_count: number; new_count: number; total_count: number
    failed_categories: string[]; failed_details: { category: string; error: string }[]
    error?: string
  }>
  fetchArxivPapersByIds: (input: string) => Promise<{
    success: boolean; fetched: { id: string; title: string }[]; existing: number; failed: number; errors: string[]
  }>

  // Summary
  summarizeArxivPaper: (paperId: string, skipIfAnalyzed?: boolean) => Promise<{ success: boolean; summary: string | null; skipped?: boolean; cancelled?: boolean }>
  stopArxivSummary: () => Promise<{ success: boolean }>
  testLLMConnection: () => Promise<{ success: boolean; message: string }>
  testZoteroConnection: () => Promise<{ success: boolean; message: string }>

  // Analysis (full paper)
  analyzeArxivFullPaper: (id: string) => Promise<{ success: boolean; cancelled?: boolean }>
  getArxivAnalysis: (id: string) => Promise<string | null>
  stopArxivAnalysis: () => Promise<{ success: boolean }>

  // PDF download
  downloadArxivPdf: (id: string) => Promise<string>
  openArxivPdf: (id: string) => Promise<void>
  isArxivPdfCached: (id: string) => Promise<boolean>
  deleteArxivPdf: (id: string) => Promise<void>
  deleteArxivSummary: (id: string) => Promise<void>
  deleteArxivAnalysis: (id: string) => Promise<void>
  onPdfDownloadProgress: (callback: (data: { paperId: string; loaded: number; total?: number }) => void) => () => void

  // Zotero
  listZoteroCollections: () => Promise<{ key: string; name: string; numItems: number }[]>
  exportPaperToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => Promise<{ success: boolean; itemKey: string }>

  // Dialog
  openDirectory: () => Promise<string | undefined>

  // Events
  onAnalysisProgress: (callback: (data: string) => void) => () => void

  // Conference
  listConferences: () => Promise<ConferenceInfo[]>
  listConferencePapers: (params: {
    conferenceId?: number | null
    search?: string
    tracks?: string[]
    topicIds?: number[]
    page?: number
    pageSize?: number
  }) => Promise<{ items: ConferencePaper[]; total: number; page: number; page_size: number }>
  listConferenceTracks: (conferenceId: number) => Promise<{ track: string; count: number }[]>
  conferenceCheckPapersSummaryStatus: (ids: string[]) => Promise<Record<string, boolean>>
  conferenceGetPaperSummary: (id: string) => Promise<string | null>
  conferenceSummarizePaper: (paperId: string, skipIfAnalyzed?: boolean) => Promise<{ success: boolean; summary: string | null; skipped?: boolean; cancelled?: boolean }>
  conferenceStopSummary: () => Promise<{ success: boolean }>
  conferenceAnalyzeFullPaper: (id: string) => Promise<{ success: boolean; cancelled?: boolean }>
  conferenceGetPaperAnalysis: (id: string) => Promise<string | null>
  conferenceStopAnalysis: () => Promise<{ success: boolean }>
  conferenceDownloadPdf: (id: string) => Promise<string>
  conferenceOpenPdf: (id: string) => Promise<void>
  conferenceIsPdfCached: (id: string) => Promise<boolean>
  conferenceDeletePdf: (id: string) => Promise<void>
  conferenceDeleteSummary: (id: string) => Promise<void>
  conferenceDeleteAnalysis: (id: string) => Promise<void>
  conferenceExportToZotero: (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string) => Promise<{ success: boolean; itemKey: string }>

  // Conference import
  conferenceReadImportFile: () => Promise<ReadImportResult | null>
  conferenceCheckConflicts: (filePath: string, selectedIds: number[]) => Promise<ConflictInfo[]>
  conferenceImport: (options: { filePath: string; resolutions: ConflictResolution[]; selectedConferenceIds?: number[] }) => Promise<ImportResult>
}

// ── Conference import sub-types ──

export interface SchemaIssue {
  missingTables: string[]
  missingColumns: { table: string; column: string }[]
  extraColumns: { table: string; column: string }[]
}

export interface SourceConference {
  id: number
  short_name: string
  year: number
  full_name: string | null
  paper_count: number
}

export interface ConflictInfo {
  source: SourceConference
  targetPaperCount: number
}

export interface ConflictResolution {
  short_name: string
  year: number
  action: 'skip' | 'overwrite_keep_analysis' | 'overwrite_clear_analysis'
}

export interface ReadImportResult {
  filePath: string
  valid: boolean
  issues?: SchemaIssue
  conferences?: SourceConference[]
}

export interface ImportResult {
  success: boolean
  importedConferences: number
  importedPapers: number
  skippedConferences: number
  error?: string
}
