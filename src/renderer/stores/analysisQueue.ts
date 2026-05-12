import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePapersStore } from './papers'
import { useConferencePapersStore } from './conference-papers'
import { useToastStore } from './toast'
import { useDownloadQueueStore } from './downloadQueue'
import { createProcessingQueue, type QueueItem } from './createProcessingQueue'

export type { QueueItem }

export const useAnalysisQueueStore = defineStore('analysisQueue', () => {
  const progressPhase = ref('')

  const queue = createProcessingQueue({
    name: 'AnalysisQueue',
    processItem: async (item) => {
      const downloadStore = useDownloadQueueStore()
      await downloadStore.waitForDownload(item.id)

      const offProgress = window.api.onAnalysisProgress((phase: string) => {
        progressPhase.value = phase
      })

      try {
        let result: { success: boolean; cancelled?: boolean }
        if (item.conference) {
          result = await window.api.conferenceAnalyzeFullPaper(item.id)
        } else {
          result = await window.api.analyzeArxivFullPaper(item.id)
        }
        if (result.cancelled) return result

        useToastStore().show('分析完成', item.title, 'success')

        // Refresh card status and bump contentVersion for detail view
        try {
          if (item.conference) {
            const store = useConferencePapersStore()
            await store.refreshStatus()
            store.contentVersion++
          } else {
            const store = usePapersStore()
            await store.refreshStatus()
            store.contentVersion++
          }
        } catch {
          // Non-fatal
        }
      } finally {
        offProgress()
        progressPhase.value = ''
      }
    },
    stopApi: () => {
      return queue.currentItem.value?.conference
        ? window.api.conferenceStopAnalysis()
        : window.api.stopArxivAnalysis()
    },
  })

  return {
    queue: queue.queue,
    currentPaperId: queue.currentPaperId,
    currentPaperTitle: queue.currentPaperTitle,
    isRunning: queue.isRunning,
    completedCount: queue.completedCount,
    errorCount: queue.errorCount,
    initialTotal: queue.initialTotal,
    progressPhase,
    isInQueue: queue.isInQueue,
    enqueue: queue.enqueue,
    requestStop: queue.requestStop,
    cancelCurrent: queue.cancelCurrent,
    remove: queue.remove,
    clear: queue.clear,
  }
})
