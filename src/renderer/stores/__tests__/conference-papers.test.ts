import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock API before importing store
vi.mock('../../api', () => ({
  listConferences: vi.fn(),
  listConferencePapers: vi.fn(),
  listConferenceTracks: vi.fn(),
  conferenceCheckPapersSummaryStatus: vi.fn(),
}))

import { useConferencePapersStore } from '../conference-papers'
import {
  listConferences,
  listConferencePapers,
  listConferenceTracks,
  conferenceCheckPapersSummaryStatus,
} from '../../api'

const mockedListConferences = vi.mocked(listConferences)
const mockedListConferencePapers = vi.mocked(listConferencePapers)
const mockedListConferenceTracks = vi.mocked(listConferenceTracks)
const mockedCheckStatus = vi.mocked(conferenceCheckPapersSummaryStatus)

function makeConferencePaper(overrides: Partial<ConferencePaper> = {}): ConferencePaper {
  return {
    id: 'cp-1',
    conference_id: 1,
    short_name: 'CVPR',
    year: 2025,
    full_name: 'CVPR 2025',
    title: 'Test Paper',
    authors: ['Author A'],
    abstract: 'Abstract',
    pdf_url: null,
    supp_url: null,
    arxiv_url: null,
    bibtex: null,
    pages: null,
    track: null,
    detail_url: null,
    ...overrides,
  }
}

function makeConferenceInfo(overrides: Partial<ConferenceInfo> = {}): ConferenceInfo {
  return {
    id: 1,
    short_name: 'CVPR',
    year: 2025,
    full_name: null,
    paper_count: 10,
    ...overrides,
  }
}

describe('useConferencePapersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    mockedListConferences.mockResolvedValue([])
    mockedListConferencePapers.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    })
    mockedListConferenceTracks.mockResolvedValue([])
    mockedCheckStatus.mockResolvedValue({})
  })

  describe('loadConferences', () => {
    it('loads conferences into state', async () => {
      const confs = [makeConferenceInfo(), makeConferenceInfo({ id: 2, short_name: 'ICLR' })]
      mockedListConferences.mockResolvedValue(confs)

      const store = useConferencePapersStore()
      await store.loadConferences()

      expect(store.conferences).toEqual(confs)
    })

    it('handles API error gracefully', async () => {
      mockedListConferences.mockRejectedValue(new Error('fail'))
      const store = useConferencePapersStore()
      await store.loadConferences()
      // Should not throw, state remains empty
      expect(store.conferences).toEqual([])
    })
  })

  describe('loadTracks', () => {
    it('loads tracks for a conference', async () => {
      const tracks = [{ track: 'Main', count: 5 }, { track: 'Workshop', count: 3 }]
      mockedListConferenceTracks.mockResolvedValue(tracks)

      const store = useConferencePapersStore()
      await store.loadTracks(1)

      expect(store.tracks).toEqual(tracks)
      expect(mockedListConferenceTracks).toHaveBeenCalledWith(1)
    })
  })

  describe('loadPapers', () => {
    it('loads papers into state', async () => {
      const papers = [makeConferencePaper(), makeConferencePaper({ id: 'cp-2', title: 'Paper 2' })]
      mockedListConferencePapers.mockResolvedValue({
        items: papers, total: 2, page: 1, page_size: 20,
      })

      const store = useConferencePapersStore()
      await store.loadPapers()

      expect(store.papers).toEqual(papers)
      expect(store.pagination.total).toBe(2)
      expect(store.loading).toBe(false)
    })

    it('appends papers when loading page > 1', async () => {
      const store = useConferencePapersStore()

      // Page 1
      mockedListConferencePapers.mockResolvedValue({
        items: [makeConferencePaper()], total: 2, page: 1, page_size: 20,
      })
      await store.loadPapers()

      // Page 2
      mockedListConferencePapers.mockResolvedValue({
        items: [makeConferencePaper({ id: 'cp-2' })], total: 2, page: 2, page_size: 20,
      })
      await store.loadPapers({ page: 2 })

      expect(store.papers).toHaveLength(2)
    })

    it('ignores stale request when newer one starts', async () => {
      const store = useConferencePapersStore()

      // First call resolves slowly
      let resolveFirst: (v: any) => void
      mockedListConferencePapers.mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))

      // Second call resolves immediately
      mockedListConferencePapers.mockResolvedValue({
        items: [makeConferencePaper({ id: 'cp-new' })], total: 1, page: 1, page_size: 20,
      })

      const firstLoad = store.loadPapers()
      const secondLoad = store.loadPapers()
      await secondLoad

      // Resolve the stale first request
      resolveFirst!({ items: [makeConferencePaper({ id: 'cp-old' })], total: 1, page: 1, page_size: 20 })
      await firstLoad

      // Only the newer result should be in state
      expect(store.papers).toHaveLength(1)
      expect(store.papers[0].id).toBe('cp-new')
    })

    it('sets error on failure', async () => {
      mockedListConferencePapers.mockRejectedValue(new Error('Network error'))

      const store = useConferencePapersStore()
      await store.loadPapers()

      expect(store.error).toBe('Network error')
      expect(store.loading).toBe(false)
    })
  })

  describe('selectConference', () => {
    it('changes conference and loads papers', async () => {
      mockedListConferenceTracks.mockResolvedValue([{ track: 'Main', count: 5 }])
      mockedListConferencePapers.mockResolvedValue({
        items: [makeConferencePaper()], total: 1, page: 1, page_size: 20,
      })

      const store = useConferencePapersStore()
      await store.selectConference(1)

      expect(store.selectedConferenceId).toBe(1)
      expect(store.tracks).toEqual([{ track: 'Main', count: 5 }])
      expect(store.papers).toHaveLength(1)
    })

    it('skips if same conference selected', async () => {
      const store = useConferencePapersStore()
      store.selectedConferenceId = 1

      await store.selectConference(1)
      expect(mockedListConferenceTracks).not.toHaveBeenCalled()
    })

    it('clears tracks when null', async () => {
      const store = useConferencePapersStore()
      store.selectedConferenceId = 1
      store.tracks = [{ track: 'Main', count: 5 }]

      await store.selectConference(null)

      expect(store.selectedConferenceId).toBeNull()
      expect(store.tracks).toEqual([])
    })
  })

  describe('toggleTrack', () => {
    it('adds and removes tracks', async () => {
      mockedListConferencePapers.mockResolvedValue({
        items: [], total: 0, page: 1, page_size: 20,
      })

      const store = useConferencePapersStore()
      await store.toggleTrack('Main')
      expect(store.selectedTracks).toEqual(['Main'])

      await store.toggleTrack('Workshop')
      expect(store.selectedTracks).toEqual(['Main', 'Workshop'])

      await store.toggleTrack('Main')
      expect(store.selectedTracks).toEqual(['Workshop'])
    })
  })

  describe('selectTopic', () => {
    it('adds and removes topic ids', async () => {
      mockedListConferencePapers.mockResolvedValue({
        items: [], total: 0, page: 1, page_size: 20,
      })

      const store = useConferencePapersStore()
      await store.selectTopic(1)
      expect(store.selectedTopicIds).toEqual([1])

      await store.selectTopic(2)
      expect(store.selectedTopicIds).toEqual([1, 2])

      await store.selectTopic(1)
      expect(store.selectedTopicIds).toEqual([2])
    })

    it('clears all when null', async () => {
      mockedListConferencePapers.mockResolvedValue({
        items: [], total: 0, page: 1, page_size: 20,
      })

      const store = useConferencePapersStore()
      store.selectedTopicIds = [1, 2]

      await store.selectTopic(null)
      expect(store.selectedTopicIds).toEqual([])
    })
  })

  describe('toggleSelection / clearSelection', () => {
    it('toggles paper selection', () => {
      const store = useConferencePapersStore()
      store.toggleSelection('p1')
      expect(store.selectedPaperIds).toEqual(['p1'])
      store.toggleSelection('p1')
      expect(store.selectedPaperIds).toEqual([])
    })

    it('clears selection', () => {
      const store = useConferencePapersStore()
      store.toggleSelection('p1')
      store.toggleSelection('p2')
      store.clearSelection()
      expect(store.selectedPaperIds).toEqual([])
    })
  })

  describe('clearPapers', () => {
    it('resets papers and pagination', () => {
      const store = useConferencePapersStore()
      store.papers = [makeConferencePaper()]
      store.selectedPaperIds = ['cp-1']
      store.pagination.total = 10
      store.pagination.page = 3

      store.clearPapers()

      expect(store.papers).toEqual([])
      expect(store.selectedPaperIds).toEqual([])
      expect(store.pagination.total).toBe(0)
      expect(store.pagination.page).toBe(1)
    })
  })

  describe('refreshStatus', () => {
    it('updates summarizedIds from API', async () => {
      mockedListConferencePapers.mockResolvedValue({
        items: [makeConferencePaper(), makeConferencePaper({ id: 'cp-2' })],
        total: 2, page: 1, page_size: 20,
      })
      mockedCheckStatus.mockResolvedValue({ 'cp-1': true, 'cp-2': false })

      const store = useConferencePapersStore()
      await store.loadPapers()

      expect(store.summarizedIds.has('cp-1')).toBe(true)
      expect(store.summarizedIds.has('cp-2')).toBe(false)
    })

    it('does nothing when no papers loaded', async () => {
      const store = useConferencePapersStore()
      await store.refreshStatus()
      expect(mockedCheckStatus).not.toHaveBeenCalled()
    })
  })

  describe('totalCount', () => {
    it('sums paper counts across conferences', () => {
      const store = useConferencePapersStore()
      store.conferences = [
        makeConferenceInfo({ paper_count: 10 }),
        makeConferenceInfo({ id: 2, paper_count: 20 }),
      ]
      expect(store.totalCount).toBe(30)
    })
  })
})
