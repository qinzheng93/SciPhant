import type { Paper } from '../types/paper'
import type { Topic, LLMConfig, OutputConfig, ZoteroConfig, Category } from '../types/config'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface FetchDate {
  date: string
  display: string
  count: number
}

// Paper API
export const listArxivPapers = async (params: {
  topicIds?: number[]
  search?: string
  fetchDate?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<Paper>> => {
  return window.api.listArxivPapers({
    topicIds: params.topicIds,
    search: params.search,
    fetchDate: params.fetchDate,
    page: params.page || 1,
    pageSize: params.pageSize || 20,
  })
}

export const checkArxivSummaryStatus = async (ids: string[]): Promise<Record<string, boolean>> => {
  return window.api.checkArxivSummaryStatus(ids)
}

export const getArxivSummary = async (id: string): Promise<string | null> => {
  return window.api.getArxivSummary(id)
}

// Config API
export const listTopics = async (): Promise<Topic[]> => {
  return window.api.listTopics()
}

export const saveTopic = async (topic: {
  id?: number
  name: string
  keywords: string[]
  enabled: boolean
}): Promise<Topic | { error: string }> => {
  return window.api.saveTopic(topic)
}

export const deleteTopic = async (topicId: number): Promise<void> => {
  return window.api.deleteTopic(topicId)
}

export const rebuildPaperTopics = async (): Promise<{ success: boolean; count: number }> => {
  return window.api.rebuildPaperTopics()
}

export const getConfig = async (): Promise<{ llm: LLMConfig; output: OutputConfig; zotero?: ZoteroConfig; theme?: string }> => {
  return window.api.getConfig()
}

export const updateConfig = async (config: {
  llm: LLMConfig
  output: OutputConfig
  zotero?: ZoteroConfig
  theme?: string
}): Promise<void> => {
  return window.api.updateConfig(config)
}

// Fetch dates API
export const listArxivFetchDates = async (): Promise<FetchDate[]> => {
  return window.api.listArxivFetchDates()
}

export interface TopicCount {
  topic_id: number
  name: string
  count: number
}

// Category API
export const listCategories = async (): Promise<Category[]> => {
  return window.api.listCategories()
}

export const saveCategory = async (category: {
  id?: number
  name: string
  enabled: boolean
}): Promise<Category> => {
  return window.api.saveCategory(category)
}

export const deleteCategory = async (categoryId: number): Promise<void> => {
  return window.api.deleteCategory(categoryId)
}

// Fetch API
export interface ArxivFailedCategory {
  category: string
  error: string
}

export interface ArxivFetchPapersResult {
  success: boolean
  new_count: number
  existing_count: number
  failed_categories: string[]
  failed_details: ArxivFailedCategory[]
}

export const openArxivPdf = async (paperId: string): Promise<void> => {
  return window.api.openArxivPdf(paperId)
}

export const fetchArxivPapers = async (categories?: string[]): Promise<ArxivFetchPapersResult> => {
  return window.api.fetchArxivPapers(categories)
}

export const fetchArxivPapersThisWeek = async (categories?: string[]): Promise<ArxivFetchPapersResult> => {
  return window.api.fetchArxivPapersThisWeek(categories)
}

export interface ArxivFetchPapersByDateParams {
  startDate: string
  endDate: string
  categories?: string[]
}

export interface ArxivFetchPapersByDateResult {
  success: boolean
  local_count: number
  new_count: number
  total_count: number
  failed_categories: string[]
  failed_details: ArxivFailedCategory[]
  error?: string
}

export const fetchArxivPapersByDate = async (params: ArxivFetchPapersByDateParams): Promise<ArxivFetchPapersByDateResult> => {
  return window.api.fetchArxivPapersByDate(params)
}

export interface FetchPapersByIdsResult {
  success: boolean
  fetched: { id: string; title: string }[]
  existing: number
  failed: number
  errors: string[]
}

export const fetchArxivPapersByIds = async (input: string): Promise<FetchPapersByIdsResult> => {
  return window.api.fetchArxivPapersByIds(input)
}

// Summary API
export const summarizeArxivPaper = async (paperId: string, skipIfAnalyzed = true): Promise<{ success: boolean; summary: string | null; skipped?: boolean }> => {
  return window.api.summarizeArxivPaper(paperId, skipIfAnalyzed)
}

export const stopArxivSummary = async (): Promise<{ success: boolean }> => {
  return window.api.stopArxivSummary()
}

export const testLLMConnection = async (): Promise<{ success: boolean; message: string }> => {
  return window.api.testLLMConnection()
}

export const testZoteroConnection = async (): Promise<{ success: boolean; message: string }> => {
  return window.api.testZoteroConnection()
}

// Analysis API (full paper)
export const analyzeArxivFullPaper = async (paperId: string): Promise<{ success: boolean; cancelled?: boolean }> => {
  return window.api.analyzeArxivFullPaper(paperId)
}

export const getArxivAnalysis = async (paperId: string): Promise<string | null> => {
  return window.api.getArxivAnalysis(paperId)
}

export const stopArxivAnalysis = async (): Promise<{ success: boolean }> => {
  return window.api.stopArxivAnalysis()
}

export const clearData = async (): Promise<{ success: boolean }> => {
  return window.api.clearData()
}

export const clearAnalyses = async (): Promise<{ success: boolean }> => {
  return window.api.clearAnalyses()
}

// Data directory
export const getDataDir = async (): Promise<string> => {
  return window.api.getDataDir()
}

export const setDataDir = async (): Promise<{ success: boolean; error?: string }> => {
  return window.api.setDataDir()
}

export const resetDataDir = async (): Promise<{ success: boolean }> => {
  return window.api.resetDataDir()
}

// Zotero API
export interface ZoteroCollection {
  key: string
  name: string
  numItems: number
}

export const listZoteroCollections = async (): Promise<ZoteroCollection[]> => {
  return window.api.listZoteroCollections()
}

export const exportPaperToZotero = async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string): Promise<{ success: boolean; itemKey: string }> => {
  return window.api.exportPaperToZotero(paperId, collectionKey, summaryHtml, analysisHtml)
}

// Conference API
export const listConferences = async (): Promise<ConferenceInfo[]> => {
  return window.api.listConferences()
}

export const listConferencePapers = async (params: {
  conferenceId?: number | null
  search?: string
  tracks?: string[]
  topicIds?: number[]
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<ConferencePaper>> => {
  return window.api.listConferencePapers({
    conferenceId: params.conferenceId,
    search: params.search,
    tracks: params.tracks,
    topicIds: params.topicIds,
    page: params.page || 1,
    pageSize: params.pageSize || 20,
  })
}

export const listConferenceTracks = async (conferenceId: number): Promise<{ track: string; count: number }[]> => {
  return window.api.listConferenceTracks(conferenceId)
}

export const conferenceCheckPapersSummaryStatus = async (ids: string[]): Promise<Record<string, boolean>> => {
  return window.api.conferenceCheckPapersSummaryStatus(ids)
}

export const conferenceGetPaperSummary = async (id: string): Promise<string | null> => {
  return window.api.conferenceGetPaperSummary(id)
}

export const conferenceSummarizePaper = async (paperId: string, skipIfAnalyzed = true): Promise<{ success: boolean; summary: string | null; skipped?: boolean; cancelled?: boolean }> => {
  return window.api.conferenceSummarizePaper(paperId, skipIfAnalyzed)
}

export const conferenceStopSummary = async (): Promise<{ success: boolean }> => {
  return window.api.conferenceStopSummary()
}

export const conferenceAnalyzeFullPaper = async (paperId: string): Promise<{ success: boolean; cancelled?: boolean }> => {
  return window.api.conferenceAnalyzeFullPaper(paperId)
}

export const conferenceGetPaperAnalysis = async (paperId: string): Promise<string | null> => {
  return window.api.conferenceGetPaperAnalysis(paperId)
}

export const conferenceStopAnalysis = async (): Promise<{ success: boolean }> => {
  return window.api.conferenceStopAnalysis()
}

export const conferenceDownloadPdf = async (paperId: string): Promise<string> => {
  return window.api.conferenceDownloadPdf(paperId)
}

export const conferenceOpenPdf = async (paperId: string): Promise<void> => {
  return window.api.conferenceOpenPdf(paperId)
}

export const conferenceIsPdfCached = async (paperId: string): Promise<boolean> => {
  return window.api.conferenceIsPdfCached(paperId)
}

export const conferenceDeletePdf = async (paperId: string): Promise<void> => {
  return window.api.conferenceDeletePdf(paperId)
}

export const conferenceDeleteSummary = async (paperId: string): Promise<void> => {
  return window.api.conferenceDeleteSummary(paperId)
}

export const conferenceDeleteAnalysis = async (paperId: string): Promise<void> => {
  return window.api.conferenceDeleteAnalysis(paperId)
}

export const conferenceExportToZotero = async (paperId: string, collectionKey: string, summaryHtml?: string, analysisHtml?: string): Promise<{ success: boolean; itemKey: string }> => {
  return window.api.conferenceExportToZotero(paperId, collectionKey, summaryHtml, analysisHtml)
}

// Conference import
export interface SchemaIssue {
  missingTables: string[];
  missingColumns: { table: string; column: string }[];
  extraColumns: { table: string; column: string }[];
}

export interface SourceConference {
  id: number;
  short_name: string;
  year: number;
  full_name: string | null;
  paper_count: number;
}

export interface ConflictInfo {
  source: SourceConference;
  targetPaperCount: number;
}

export interface ConflictResolution {
  short_name: string;
  year: number;
  action: 'skip' | 'overwrite_keep_analysis' | 'overwrite_clear_analysis';
}

export interface ReadImportResult {
  filePath: string;
  valid: boolean;
  issues?: SchemaIssue;
  conferences?: SourceConference[];
}

export interface ImportResult {
  success: boolean;
  importedConferences: number;
  importedPapers: number;
  skippedConferences: number;
  error?: string;
}

export const conferenceReadImportFile = async (): Promise<ReadImportResult | null> => {
  return window.api.conferenceReadImportFile()
}

export const conferenceCheckConflicts = async (filePath: string, selectedIds: number[]): Promise<ConflictInfo[]> => {
  return window.api.conferenceCheckConflicts(filePath, selectedIds)
}

export const conferenceImport = async (options: {
  filePath: string;
  resolutions: ConflictResolution[];
  selectedConferenceIds?: number[];
}): Promise<ImportResult> => {
  return window.api.conferenceImport(options)
}
