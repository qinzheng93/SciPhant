<template>
  <Teleport to="body">
    <div class="sidebar-dialog">
      <div class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-box" style="width: 520px;">
          <h3 class="dialog-title">导入会议</h3>
          <div class="dialog-body">
            <!-- Step 1: Select file -->
            <template v-if="step === 'idle'">
              <p class="setting-hint" style="margin-bottom: 12px;">选择包含会议论文数据的 .db 文件。</p>
              <button class="btn-default" @click="selectFile">选择文件</button>
            </template>

            <!-- Step 2: Validation failed -->
            <template v-else-if="step === 'invalid'">
              <p class="import-error-title">文件格式不符合要求</p>
              <div v-if="validationResult?.issues" class="import-schema-issues">
                <p v-if="validationResult.issues.missingTables.length > 0">
                  缺少表: {{ validationResult.issues.missingTables.join(', ') }}
                </p>
                <p v-if="validationResult.issues.missingColumns.length > 0">
                  缺少列: {{ validationResult.issues.missingColumns.map(c => `${c.table}.${c.column}`).join(', ') }}
                </p>
              </div>
            </template>

            <!-- Step 3: Select conferences to import -->
            <template v-else-if="step === 'select'">
              <div class="import-select-header">
                <p class="setting-hint">
                  检测到 {{ conferences.length }} 个会议，请选择要导入的会议：
                </p>
                <button class="btn-text" @click="toggleSelectAll">
                  {{ isAllSelected ? '取消全选' : '全选' }}
                </button>
              </div>
              <div class="import-conference-list">
                <label v-for="conf in conferences" :key="conf.id" class="import-conference-item">
                  <input type="checkbox" :value="conf.id" v-model="selectedIds" />
                  <span class="import-conference-name">{{ conf.short_name }} {{ conf.year }}</span>
                  <span v-if="conf.full_name" class="import-conference-full">{{ conf.full_name }}</span>
                  <span class="import-conference-count">{{ conf.paper_count }} 篇</span>
                </label>
              </div>
            </template>

            <!-- Step 4: Conflicts -->
            <template v-else-if="step === 'conflicts'">
              <p class="setting-hint" style="margin-bottom: 12px;">
                以下 {{ conflicts.length }} 个会议已存在，请选择处理方式：
              </p>
              <div class="import-set-all">
                <span class="import-set-all-label">全部设置：</span>
                <button class="btn-text" @click="setAllResolutions('skip')">跳过</button>
                <button class="btn-text" @click="setAllResolutions('overwrite_keep_analysis')">覆盖（保留分析）</button>
                <button class="btn-text" @click="setAllResolutions('overwrite_clear_analysis')">覆盖（清除分析）</button>
              </div>
              <div class="import-conflicts">
                <div v-for="conflict in conflicts" :key="`${conflict.source.short_name}-${conflict.source.year}`" class="import-conflict-item">
                  <div class="import-conflict-label">
                    <strong>{{ conflict.source.short_name }} {{ conflict.source.year }}</strong>
                    <span class="import-conflict-count">已有 {{ conflict.targetPaperCount }} 篇，导入 {{ conflict.source.paper_count }} 篇</span>
                  </div>
                  <select v-model="resolutions[`${conflict.source.short_name}:${conflict.source.year}`]" class="import-select">
                    <option value="">请选择</option>
                    <option value="skip">跳过</option>
                    <option value="overwrite_keep_analysis">覆盖（保留已有分析）</option>
                    <option value="overwrite_clear_analysis">覆盖（清除已有分析）</option>
                  </select>
                </div>
              </div>
            </template>

            <!-- Step 5: Importing -->
            <template v-else-if="step === 'importing'">
              <div class="import-progress">
                <p class="import-progress-text">正在导入...</p>
                <div class="import-progress-bar">
                  <div class="import-progress-fill" :style="{ width: progressPercent + '%' }"></div>
                </div>
              </div>
            </template>

            <!-- Done step removed — success/failure both handled via toast -->
          </div>

          <div class="dialog-footer">
            <button class="btn-cancel" @click="handleClose">取消</button>
            <button
              v-if="step === 'select'"
              class="btn-primary"
              :disabled="selectedIds.length === 0"
              @click="submitSelection"
            >
              下一步
            </button>
            <button
              v-if="step === 'conflicts'"
              class="btn-primary"
              :disabled="!allConflictsResolved"
              @click="doImport"
            >
              导入
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  conferenceReadImportFile,
  conferenceCheckConflicts,
  conferenceImport,
  type ReadImportResult,
  type SourceConference,
  type ConflictInfo,
  type ConflictResolution,
  type ImportResult,
} from '../../api'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', result: ImportResult): void
  (e: 'failed', error: string): void
}>()

type Step = 'idle' | 'invalid' | 'select' | 'conflicts' | 'importing' | 'done'
const step = ref<Step>('idle')

const validationResult = ref<ReadImportResult | null>(null)
const conferences = ref<SourceConference[]>([])
const selectedIds = ref<number[]>([])
const conflicts = ref<ConflictInfo[]>([])
const resolutions = reactive<Record<string, string>>({})
const progressPercent = ref(0)

const allConflictsResolved = computed(() => {
  return conflicts.value.every(c => resolutions[`${c.source.short_name}:${c.source.year}`] !== '')
})

const handleClose = () => {
  if (step.value === 'importing') return
  emit('close')
}

const isAllSelected = computed(() =>
  conferences.value.length > 0 && selectedIds.value.length === conferences.value.length,
)

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = conferences.value.map(c => c.id)
  }
}

const setAllResolutions = (action: string) => {
  for (const c of conflicts.value) {
    resolutions[`${c.source.short_name}:${c.source.year}`] = action
  }
}

const selectFile = async () => {
  const result = await conferenceReadImportFile()
  if (!result) return

  validationResult.value = result

  if (!result.valid) {
    step.value = 'invalid'
    return
  }

  conferences.value = result.conferences || []
  selectedIds.value = []
  step.value = 'select'
}

const submitSelection = async () => {
  if (selectedIds.value.length === 0) return

  try {
    const detectedConflicts = await conferenceCheckConflicts(
      validationResult.value!.filePath,
      [...selectedIds.value],
    )

    if (detectedConflicts.length === 0) {
      doImport()
      return
    }

    conflicts.value = detectedConflicts
    for (const c of detectedConflicts) {
      resolutions[`${c.source.short_name}:${c.source.year}`] = ''
    }
    step.value = 'conflicts'
  } catch (err) {
    console.error('Failed to check conflicts:', err)
  }
}

const doImport = async () => {
  // Check if all selected conferences are skipped
  const allSkipped = conflicts.value.length === selectedIds.value.length
    && conflicts.value.every(c => resolutions[`${c.source.short_name}:${c.source.year}`] === 'skip')

  if (allSkipped) {
    emit('imported', { success: true, importedConferences: 0, importedPapers: 0, skippedConferences: conflicts.value.length })
    return
  }

  step.value = 'importing'
  progressPercent.value = 20

  const resolutionList: ConflictResolution[] = Object.entries(resolutions).map(([key, action]) => {
    const [short_name, yearStr] = key.split(':')
    return {
      short_name,
      year: Number(yearStr),
      action: action as ConflictResolution['action'],
    }
  })

  try {
    progressPercent.value = 50
    const result = await conferenceImport({
      filePath: validationResult.value!.filePath,
      resolutions: resolutionList,
      selectedConferenceIds: [...selectedIds.value],
    })
    progressPercent.value = 100

    if (result.success) {
      emit('imported', result)
    } else {
      emit('failed', result.error || '未知错误')
    }
  } catch (err) {
    emit('failed', err instanceof Error ? err.message : String(err))
  }
}
</script>

<style scoped>
.import-error-title {
  color: var(--color-error);
  font-weight: 500;
  margin-bottom: 8px;
}

.import-schema-issues p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0;
}

.import-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.import-select-header .setting-hint {
  margin: 0;
}

.import-conference-list {
  max-height: 320px;
  overflow-y: auto;
}

.import-conference-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.import-conference-item:hover {
  background: var(--bg-tertiary);
}

.import-conference-item input[type="checkbox"] {
  flex-shrink: 0;
}

.import-conference-name {
  font-weight: 500;
  color: var(--text-primary);
}

.import-conference-full {
  color: var(--text-tertiary);
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-conference-count {
  color: var(--text-tertiary);
  font-size: 12px;
  flex-shrink: 0;
}

.import-conflicts {
  margin-top: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.import-set-all {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.import-set-all-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-right: 4px;
}

.btn-text {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.btn-text:hover {
  background: var(--bg-tertiary);
}

.import-conflict-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.import-conflict-label {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.import-conflict-label strong {
  display: block;
}

.import-conflict-count {
  color: var(--text-tertiary);
  font-size: 12px;
}

.import-select {
  height: 32px;
  font-size: 13px;
  width: 160px;
  flex-shrink: 0;
  padding: 0 8px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  color: var(--text-primary);
  background: var(--card-bg);
}

.import-progress {
  padding: 12px 0;
}

.import-progress-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.import-progress-bar {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.import-progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.import-done-success {
  color: var(--color-success, #16a34a);
  font-weight: 500;
  margin-bottom: 4px;
}

.import-done-detail {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
