<template>
  <div class="config-section">
    <h3>LLM 设置</h3>

    <div class="form-row">
      <label>API Key</label>
      <div class="input-wrapper">
        <input v-model="configStore.llmConfig.api_key" :type="showApiKey ? 'text' : 'password'" placeholder="sk-..." class="input-icon-right" />
        <button class="toggle-visibility" @click="showApiKey = !showApiKey">
          <Eye v-if="!showApiKey" :size="16" />
          <EyeOff v-else :size="16" />
        </button>
      </div>
    </div>

    <div class="form-row">
      <label>Base URL</label>
      <input v-model="configStore.llmConfig.base_url" placeholder="https://api.openai.com/v1" />
    </div>

    <div class="form-row">
      <label>Model</label>
      <input v-model="configStore.llmConfig.model" placeholder="gpt-4o" />
    </div>

    <div class="form-row">
      <label>Temperature</label>
      <input v-model.number="configStore.llmConfig.temperature" type="number" min="0" max="2" step="0.1" />
    </div>

    <div class="test-row">
      <button class="btn-default" @click="testConnection" :disabled="testing">
        {{ testing ? '测试中...' : '测试连接' }}
      </button>
      <span v-if="testResult" :class="testResult.success ? 'test-success' : 'test-error'">
        {{ testResult.message }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { useConfigStore } from '../../stores/config'
import { testLLMConnection } from '../../api'

const configStore = useConfigStore()
const showApiKey = ref(false)
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const testConnection = async () => {
  testing.value = true
  testResult.value = null
  try {
    const result = await testLLMConnection()
    testResult.value = { success: result.success, message: result.message || '连接成功' }
  } catch (err: unknown) {
    console.error('LLM test error:', err)
    let msg = '连接失败'
    if (typeof err === 'string') {
      msg = err
    } else if (err instanceof Error) {
      msg = err.message
    } else if (typeof err === 'object' && err !== null) {
      const obj = err as Record<string, unknown>
      msg = String(obj.LLM || obj.Database || obj.Config || obj.message || msg)
    } else {
      msg = String(err)
    }
    testResult.value = { success: false, message: msg }
  } finally {
    testing.value = false
  }
}
</script>
