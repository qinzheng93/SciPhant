<template>
  <div class="config-section">
    <h3>通用设置</h3>

    <div class="setting-group">
      <label class="setting-label">外观</label>
      <div class="theme-options">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="btn-theme"
          :class="{ active: configStore.theme === option.value }"
          @click="configStore.theme = option.value"
        >
          <component :is="option.icon" :size="28" />
          <span>{{ option.label }}</span>
        </button>
      </div>
    </div>

    <div class="setting-divider"></div>

    <div class="setting-group">
      <label class="setting-label">数据目录</label>
      <p class="setting-hint">存储论文数据库、分析文件和 PDF 的位置。更改后应用将自动重启。</p>
      <div class="datadir-row">
        <span class="datadir-path">{{ currentDir }}</span>
      </div>
      <div class="datadir-actions">
        <button class="btn-default" @click="handleChange">选择目录</button>
        <button class="btn-default" @click="handleReset">恢复默认</button>
      </div>
    </div>

    <div class="setting-divider"></div>

    <div class="setting-group">
      <label class="setting-label">软件版本</label>
      <span class="version-text">v{{ appVersion }}</span>
      <div style="margin-top: 8px">
        <button class="btn-default" :disabled="checking" @click="handleCheckUpdate">
          {{ checking ? '检查中...' : '检查更新' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { getDataDir, setDataDir, resetDataDir, checkForUpdate, getAppVersion } from '../../api'
import { useConfigStore } from '../../stores/config'
import { useToastStore } from '../../stores/toast'

const configStore = useConfigStore()
const toastStore = useToastStore()
const currentDir = ref('')
const appVersion = ref('')
const checking = ref(false)

const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

onMounted(async () => {
  try {
    currentDir.value = await getDataDir()
  } catch {
    currentDir.value = ''
  }
  try {
    appVersion.value = await getAppVersion()
  } catch {
    appVersion.value = '?'
  }
})

const handleChange = async () => {
  try {
    const result = await setDataDir()
    if (!result.success && result.error) {
      alert(result.error)
    }
  } catch (err) {
    alert('更改目录失败: ' + (err instanceof Error ? err.message : err))
  }
}

const handleReset = async () => {
  try {
    await resetDataDir()
  } catch (err) {
    alert('重置失败: ' + (err instanceof Error ? err.message : err))
  }
}

const handleCheckUpdate = async () => {
  checking.value = true
  try {
    const result = await checkForUpdate()
    if (!result) {
      toastStore.show('检查更新', '已是最新版本', 'success')
    }
    // If update is available, the main process will show the update window
  } catch (err) {
    toastStore.show('检查更新失败', err instanceof Error ? err.message : '未知错误', 'error')
  } finally {
    checking.value = false
  }
}
</script>

<style scoped>
.btn-theme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 80px;
}

.version-text {
  font-size: 14px;
  color: var(--text-tertiary);
  font-family: monospace;
}
</style>
