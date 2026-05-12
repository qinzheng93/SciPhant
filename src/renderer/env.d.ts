/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Topic {
  id: number
  name: string
  keywords: string[]
  enabled: boolean
}

interface Category {
  id: number
  name: string
  enabled: boolean
}

interface LLMConfig {
  api_key: string
  base_url: string
  model: string
  temperature: number
}

interface OutputConfig {
  output_dir: string
  auto_save: boolean
}

interface ZoteroConfig {
  api_key: string
  user_id: string
}

interface Paper {
  id: string
  title: string
  authors: string[]
  abstract_text: string
  url: string
  pdf_url: string
  published_date: string
  updated_date: string
  categories: string[]
  fetched_at: string
}

interface ConferencePaper {
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

interface ConferenceInfo {
  id: number
  short_name: string
  year: number
  full_name: string
  paper_count: number
}

interface ElectronAPI {
  // Paper
  listArxivPapers: (params: {
    topicIds?: number[]
    search?: string
    fetchDate?: string
    page?: number
    pageSize?: number
  }) => Promise<{ items: Paper[]; total: number; page: number; page_size: number }>
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
  onSummaryProgress: (callback: (data: any) => void) => () => void
  onAnalysisProgress: (callback: (data: any) => void) => () => void

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
}

interface Window {
  api: ElectronAPI
}
