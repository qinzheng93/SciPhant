import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock API before importing store
vi.mock('../../api', () => ({
  listArxivPapers: vi.fn(),
  checkArxivSummaryStatus: vi.fn(),
  listArxivFetchDates: vi.fn(),
}))

import { usePapersStore } from '../papers'
import {
  listArxivPapers,
  checkArxivSummaryStatus,
  listArxivFetchDates,
} from '../../api'

const mockedListArxivPapers = vi.mocked(listArxivPapers)
const mockedCheckArxivSummaryStatus = vi.mocked(checkArxivSummaryStatus)
const mockedListArxivFetchDates = vi.mocked(listArxivFetchDates)

function makePaper(overrides: Partial<ArxivPaper> = {}): ArxivPaper {
  return {
    id: 'paper-1',
    title: 'Test Paper',
    authors: ['Author A'],
    abstract: 'Abstract',
    url: 'https://arxiv.org/abs/paper-1',
    pdf_url: 'https://arxiv.org/pdf/paper-1',
    published_date: '2025-01-01',
    updated_date: '2025-01-01',
    categories: ['cs.AI'],
    fetched_at: '2025-01-01',
    ...overrides,
  }
}

describe('usePapersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    // Default mocks so auto-init calls on store creation don't interfere
    mockedListArxivPapers.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    })
    mockedCheckArxivSummaryStatus.mockResolvedValue({})
    mockedListArxivFetchDates.mockResolvedValue([])
  })

  describe('initial state', () => {
    it('has empty papers and default values after auto-init resolves', async () => {
      const store = usePapersStore()
      // Wait for auto-init calls (loadFetchDates + loadPapers) to settle
      await new Promise(r => setTimeout(r, 0))

      expect(store.papers).toEqual([])
      expect(store.fetchDates).toEqual([])
      expect(store.selectedPaperIds).toEqual([])
      expect(store.selectedDate).toBeNull()
      expect(store.selectedTopicIds).toEqual([])
      expect(store.searchQuery).toBe('')
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
      expect(store.pagination).toEqual({ page: 1, pageSize: 20, total: 0 })
      expect(store.summarizedIds.size).toBe(0)
    })
  })

  describe('loadFetchDates', () => {
    it('populates fetchDates from API', async () => {
      const dates = [
        { date: '2025-01-15', display: 'Jan 15', count: 5 },
        { date: '2025-01-14', display: 'Jan 14', count: 3 },
      ]
      mockedListArxivFetchDates.mockResolvedValue(dates)
      const store = usePapersStore()
      await store.loadFetchDates()
      expect(store.fetchDates).toEqual(dates)
    })

    it('handles error gracefully without throwing', async () => {
      mockedListArxivFetchDates.mockRejectedValue(new Error('network'))
      const store = usePapersStore()
      // Should not throw
      await store.loadFetchDates()
      expect(store.fetchDates).toEqual([])
    })
  })

  describe('loadPapers', () => {
    it('loads papers on page 1, sets loading, updates pagination', async () => {
      const papers = [makePaper({ id: 'p1' }), makePaper({ id: 'p2' })]
      mockedListArxivPapers.mockResolvedValue({
        items: papers,
        total: 42,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()

      const promise = store.loadPapers()
      // loading should be true while papers list was empty before call
      expect(store.loading).toBe(true)

      await promise

      expect(store.papers).toEqual(papers)
      expect(store.loading).toBe(false)
      expect(store.pagination.total).toBe(42)
      expect(store.pagination.page).toBe(1)
      expect(mockedListArxivPapers).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 })
      )
    })

    it('passes search, fetchDate, and topicIds to API', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      // Set filters directly
      store.searchQuery = 'transformer'
      store.selectedDate = '2025-01-15'
      store.selectedTopicIds = [10, 20]

      await store.loadPapers()

      expect(mockedListArxivPapers).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'transformer',
          fetchDate: '2025-01-15',
          topicIds: [10, 20],
        })
      )
    })

    it('syncs search param to store state', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      expect(store.searchQuery).toBe('')

      await store.loadPapers({ search: 'attention' })

      expect(store.searchQuery).toBe('attention')
      expect(mockedListArxivPapers).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'attention' })
      )
    })

    it('appends papers on page > 1 instead of replacing', async () => {
      const page1 = [makePaper({ id: 'p1' })]
      const page2 = [makePaper({ id: 'p2' })]
      mockedListArxivPapers.mockResolvedValue({
        items: page1,
        total: 2,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      await store.loadPapers()
      expect(store.papers).toEqual(page1)

      mockedListArxivPapers.mockResolvedValue({
        items: page2,
        total: 2,
        page: 2,
        page_size: 20,
      })
      await store.loadPapers({ page: 2 })

      expect(store.papers).toEqual([page1[0], page2[0]])
      expect(store.pagination.page).toBe(2)
    })

    it('does not set loading on page 1 when papers already loaded', async () => {
      const papers = [makePaper({ id: 'p1' })]
      mockedListArxivPapers.mockResolvedValue({
        items: papers,
        total: 1,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      await store.loadPapers()

      // Now papers is non-empty; reload page 1 should NOT set loading
      let loadingDuringCall = false
      mockedListArxivPapers.mockImplementation(async () => {
        loadingDuringCall = store.loading
        return { items: papers, total: 1, page: 1, page_size: 20 }
      })
      await store.loadPapers()
      expect(loadingDuringCall).toBe(false)
    })

    it('sets error on API failure', async () => {
      mockedListArxivPapers.mockRejectedValue(new Error('server error'))
      const store = usePapersStore()
      await store.loadPapers()

      expect(store.error).toBe('server error')
      expect(store.loading).toBe(false)
    })

    it('sets generic error for non-Error thrown values', async () => {
      mockedListArxivPapers.mockRejectedValue('string error')
      const store = usePapersStore()
      await store.loadPapers()

      expect(store.error).toBe('Failed to load papers')
    })

    it('discards stale response when a newer request supersedes', async () => {
      // Create store (auto-init will use the default mock from beforeEach)
      const store = usePapersStore()
      // Wait for auto-init to settle
      await vi.waitFor(() => expect(mockedListArxivPapers).toHaveBeenCalled())

      let resolveFirst: (v: any) => void
      let resolveSecond: (v: any) => void
      const firstCall = new Promise(r => { resolveFirst = r })
      const secondCall = new Promise(r => { resolveSecond = r })

      mockedListArxivPapers
        .mockImplementationOnce(() => firstCall as any)
        .mockImplementationOnce(() => secondCall as any)

      // Start first request
      const p1 = store.loadPapers()
      // Start second request (supersedes first)
      const p2 = store.loadPapers()

      // Resolve second first
      resolveSecond!({
        items: [makePaper({ id: 'second' })],
        total: 1,
        page: 1,
        page_size: 20,
      })
      await p2

      // Resolve first after — should be discarded
      resolveFirst!({
        items: [makePaper({ id: 'first' })],
        total: 1,
        page: 1,
        page_size: 20,
      })
      await p1

      expect(store.papers).toEqual([makePaper({ id: 'second' })])
    })
  })

  describe('refreshStatus', () => {
    it('populates summarizedIds from API response', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [makePaper({ id: 'p1' }), makePaper({ id: 'p2' }), makePaper({ id: 'p3' })],
        total: 3,
        page: 1,
        page_size: 20,
      })
      mockedCheckArxivSummaryStatus.mockResolvedValue({
        p1: true,
        p2: false,
        p3: true,
      })
      const store = usePapersStore()
      await store.loadPapers()

      expect(store.summarizedIds.has('p1')).toBe(true)
      expect(store.summarizedIds.has('p2')).toBe(false)
      expect(store.summarizedIds.has('p3')).toBe(true)
    })

    it('skips API call when papers list is empty', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      vi.clearAllMocks()

      await store.refreshStatus()

      expect(mockedCheckArxivSummaryStatus).not.toHaveBeenCalled()
    })

    it('handles error gracefully', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [makePaper({ id: 'p1' })],
        total: 1,
        page: 1,
        page_size: 20,
      })
      mockedCheckArxivSummaryStatus.mockRejectedValue(new Error('fail'))
      const store = usePapersStore()
      // Should not throw
      await store.loadPapers()
      expect(store.summarizedIds.size).toBe(0)
    })
  })

  describe('selectDate', () => {
    it('updates selectedDate, clears topics and selection, reloads papers', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [makePaper()],
        total: 1,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      // Set some state to verify it gets cleared
      store.toggleSelection('x')
      store.selectedTopicIds = [5]

      await store.selectDate('2025-01-15')

      expect(store.selectedDate).toBe('2025-01-15')
      expect(store.selectedTopicIds).toEqual([])
      expect(store.selectedPaperIds).toEqual([])
      expect(mockedListArxivPapers).toHaveBeenCalledWith(
        expect.objectContaining({ fetchDate: '2025-01-15' })
      )
    })

    it('accepts null to clear date filter', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      await store.selectDate('2025-01-15')
      await store.selectDate(null)

      expect(store.selectedDate).toBeNull()
      expect(mockedListArxivPapers).toHaveBeenLastCalledWith(
        expect.objectContaining({ fetchDate: undefined })
      )
    })
  })

  describe('selectTopic', () => {
    it('adds topic ID when not present', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()

      await store.selectTopic(5)
      expect(store.selectedTopicIds).toEqual([5])

      await store.selectTopic(10)
      expect(store.selectedTopicIds).toEqual([5, 10])
    })

    it('removes topic ID when already present (toggle off)', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()

      await store.selectTopic(5)
      await store.selectTopic(10)
      await store.selectTopic(5)

      expect(store.selectedTopicIds).toEqual([10])
    })

    it('clears all topic filters when null is passed', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()

      await store.selectTopic(5)
      await store.selectTopic(10)
      await store.selectTopic(null)

      expect(store.selectedTopicIds).toEqual([])
    })

    it('clears selection and reloads papers', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      const store = usePapersStore()
      store.toggleSelection('x')

      const callCount = mockedListArxivPapers.mock.calls.length
      await store.selectTopic(5)

      expect(store.selectedPaperIds).toEqual([])
      expect(mockedListArxivPapers).toHaveBeenCalledTimes(callCount + 1)
      expect(mockedListArxivPapers).toHaveBeenLastCalledWith(
        expect.objectContaining({ topicIds: [5] })
      )
    })
  })

  describe('toggleSelection', () => {
    it('adds paper ID when not selected', () => {
      const store = usePapersStore()
      store.toggleSelection('p1')
      expect(store.selectedPaperIds).toEqual(['p1'])
      store.toggleSelection('p2')
      expect(store.selectedPaperIds).toEqual(['p1', 'p2'])
    })

    it('removes paper ID when already selected', () => {
      const store = usePapersStore()
      store.toggleSelection('p1')
      store.toggleSelection('p2')
      store.toggleSelection('p1')
      expect(store.selectedPaperIds).toEqual(['p2'])
    })
  })

  describe('clearSelection', () => {
    it('empties selectedPaperIds', () => {
      const store = usePapersStore()
      store.toggleSelection('p1')
      store.toggleSelection('p2')
      store.clearSelection()
      expect(store.selectedPaperIds).toEqual([])
    })
  })

  describe('clearPapers', () => {
    it('resets papers, selection, and pagination', async () => {
      mockedListArxivPapers.mockResolvedValue({
        items: [makePaper({ id: 'p1' })],
        total: 50,
        page: 3,
        page_size: 20,
      })
      const store = usePapersStore()
      await store.loadPapers({ page: 3 })
      store.toggleSelection('p1')

      store.clearPapers()

      expect(store.papers).toEqual([])
      expect(store.selectedPaperIds).toEqual([])
      expect(store.pagination.total).toBe(0)
      expect(store.pagination.page).toBe(1)
    })
  })

  describe('totalCount', () => {
    it('sums counts from all fetch dates', async () => {
      mockedListArxivFetchDates.mockResolvedValue([
        { date: '2025-01-15', display: 'Jan 15', count: 5 },
        { date: '2025-01-14', display: 'Jan 14', count: 3 },
        { date: '2025-01-13', display: 'Jan 13', count: 7 },
      ])
      const store = usePapersStore()
      await store.loadFetchDates()

      expect(store.totalCount).toBe(15)
    })

    it('returns 0 when no fetch dates', () => {
      const store = usePapersStore()
      expect(store.totalCount).toBe(0)
    })
  })
})
