import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listConferencePapers,
  listConferences as apiListConferences,
  listConferenceTracks,
  conferenceCheckPapersSummaryStatus,
} from '../api'

const PAGE_SIZE = 20

export const useConferencePapersStore = defineStore('conferencePapers', () => {
  const papers = ref<ConferencePaper[]>([])
  const conferences = ref<ConferenceInfo[]>([])
  const tracks = ref<{ track: string; count: number }[]>([])
  const selectedConferenceId = ref<number | null>(null)
  const selectedTracks = ref<string[]>([])
  const selectedTopicIds = ref<number[]>([])
  const selectedPaperIds = ref<string[]>([])
  const searchQuery = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  })
  const contentVersion = ref(0)
  const summarizedIds = ref<Set<string>>(new Set())

  const totalCount = computed(() =>
    conferences.value.reduce((sum, c) => sum + c.paper_count, 0)
  )

  let loadRequestId = 0

  const loadConferences = async () => {
    try {
      conferences.value = await apiListConferences()
    } catch (err) {
      console.error('Failed to load conferences:', err)
    }
  }

  const loadTracks = async (conferenceId: number) => {
    try {
      tracks.value = await listConferenceTracks(conferenceId)
    } catch (err) {
      console.error('Failed to load tracks:', err)
      tracks.value = []
    }
  }

  const refreshStatus = async () => {
    const ids = papers.value.map(p => p.id)
    if (ids.length === 0) return
    try {
      const statuses = await conferenceCheckPapersSummaryStatus(ids)
      const set = new Set<string>()
      for (const [id, has] of Object.entries(statuses)) {
        if (has) set.add(id)
      }
      summarizedIds.value = set
    } catch (err) {
      console.error('Failed to refresh conference status:', err)
    }
  }

  const loadPapers = async (params: {
    search?: string
    page?: number
  } = {}) => {
    const requestId = ++loadRequestId
    if (!params.page || params.page <= 1) {
      loading.value = papers.value.length === 0
    }
    error.value = null

    if (params.search !== undefined) {
      searchQuery.value = params.search
    }

    try {
      const result = await listConferencePapers({
        conferenceId: selectedConferenceId.value,
        search: searchQuery.value || undefined,
        tracks: selectedTracks.value.length > 0 ? [...selectedTracks.value] : undefined,
        topicIds: selectedTopicIds.value.length > 0 ? [...selectedTopicIds.value] : undefined,
        page: params.page || 1,
        pageSize: PAGE_SIZE,
      })

      if (requestId !== loadRequestId) return

      if (params.page && params.page > 1) {
        papers.value.push(...result.items)
      } else {
        papers.value = result.items
      }

      pagination.value.total = result.total
      pagination.value.page = result.page

      // Refresh summary status from filesystem
      await refreshStatus()
    } catch (err) {
      if (requestId !== loadRequestId) return
      error.value = err instanceof Error ? err.message : 'Failed to load conference papers'
      console.error('Failed to load conference papers:', err)
    } finally {
      if (requestId === loadRequestId) loading.value = false
    }
  }

  const selectConference = async (id: number | null) => {
    if (selectedConferenceId.value === id) return
    selectedConferenceId.value = id
    selectedTracks.value = []
    selectedTopicIds.value = []
    tracks.value = []
    clearSelection()
    if (id) {
      await loadTracks(id)
    }
    await loadPapers()
  }

  const toggleTrack = async (track: string) => {
    const idx = selectedTracks.value.indexOf(track)
    if (idx >= 0) {
      selectedTracks.value.splice(idx, 1)
    } else {
      selectedTracks.value.push(track)
    }
    clearSelection()
    await loadPapers()
  }

  const selectTopic = async (topicId: number | null) => {
    if (topicId === null) {
      selectedTopicIds.value = []
    } else {
      const idx = selectedTopicIds.value.indexOf(topicId)
      if (idx >= 0) {
        selectedTopicIds.value.splice(idx, 1)
      } else {
        selectedTopicIds.value.push(topicId)
      }
    }
    clearSelection()
    await loadPapers()
  }

  const toggleSelection = (id: string) => {
    const idx = selectedPaperIds.value.indexOf(id)
    if (idx >= 0) {
      selectedPaperIds.value.splice(idx, 1)
    } else {
      selectedPaperIds.value.push(id)
    }
  }

  const clearSelection = () => {
    selectedPaperIds.value = []
  }

  const clearPapers = () => {
    papers.value = []
    selectedPaperIds.value = []
    pagination.value.total = 0
    pagination.value.page = 1
  }

  return {
    papers, conferences, tracks,
    selectedConferenceId, selectedTracks, selectedTopicIds,
    selectedPaperIds,
    searchQuery, loading, error, pagination, totalCount, contentVersion, summarizedIds,
    loadConferences, loadTracks, loadPapers,
    selectConference, toggleTrack, selectTopic,
    clearPapers,
    toggleSelection, clearSelection, refreshStatus,
  }
})
