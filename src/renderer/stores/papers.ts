import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FetchDate } from '../api'
import { listArxivPapers, checkArxivSummaryStatus, listArxivFetchDates } from '../api'

const PAGE_SIZE = 20

export const usePapersStore = defineStore('papers', () => {
  // State
  const papers = ref<ArxivPaper[]>([])
  const fetchDates = ref<FetchDate[]>([])
  const selectedPaperIds = ref<string[]>([])
  const selectedDate = ref<string | null>(null) // null = "全部"
  const selectedTopicIds = ref<number[]>([]) // empty = "全部"
  const searchQuery = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  })
  const summarizedIds = ref<Set<string>>(new Set())
  const contentVersion = ref(0)

  // Total count across all dates
  const totalCount = computed(() =>
    fetchDates.value.reduce((sum, d) => sum + d.count, 0)
  )

  // Request serial counter to discard stale responses
  let loadRequestId = 0

  // Actions
  const loadFetchDates = async () => {
    try {
      fetchDates.value = await listArxivFetchDates()
    } catch (err) {
      console.error('Failed to load fetch dates:', err)
    }
  }

  const refreshStatus = async () => {
    const ids = papers.value.map(p => p.id)
    if (ids.length === 0) return
    try {
      const statuses = await checkArxivSummaryStatus(ids)
      const set = new Set<string>()
      for (const [id, has] of Object.entries(statuses)) {
        if (has) set.add(id)
      }
      summarizedIds.value = set
    } catch (err) {
      console.error('Failed to refresh status:', err)
    }
  }

  const loadPapers = async (params: {
    search?: string
    page?: number
  } = {}) => {
    const requestId = ++loadRequestId
    // Only show loading spinner on initial load (empty list)
    if (!params.page || params.page <= 1) {
      loading.value = papers.value.length === 0
    }
    error.value = null
    // If search param is provided, sync it to store; otherwise use store's searchQuery
    if (params.search !== undefined) {
      searchQuery.value = params.search
    }
    try {
      const result = await listArxivPapers({
        search: searchQuery.value || undefined,
        fetchDate: selectedDate.value || undefined,
        topicIds: selectedTopicIds.value.length > 0 ? [...selectedTopicIds.value] : undefined,
        page: params.page || 1,
        pageSize: PAGE_SIZE,
      })

      // Discard stale response if a newer request was started
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
      error.value = err instanceof Error ? err.message : 'Failed to load papers'
      console.error('Failed to load papers:', err)
    } finally {
      if (requestId === loadRequestId) loading.value = false
    }
  }

  const selectDate = async (date: string | null) => {
    selectedDate.value = date
    selectedTopicIds.value = []
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

  // Initialize
  loadFetchDates()
  loadPapers()

  return {
    papers, fetchDates, selectedDate, selectedTopicIds, searchQuery,
    selectedPaperIds,
    loading, error, pagination, totalCount, contentVersion, summarizedIds,
    loadFetchDates, loadPapers, selectDate, selectTopic,
    clearPapers,
    toggleSelection, clearSelection, refreshStatus,
  }
})
