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
          {{ option.label }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDataDir, setDataDir, resetDataDir } from '../../api'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()
const currentDir = ref('')

const themeOptions: { value: 'light' | 'dark' | 'system'; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

onMounted(async () => {
  try {
    currentDir.value = await getDataDir()
  } catch {
    currentDir.value = ''
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
</script>
