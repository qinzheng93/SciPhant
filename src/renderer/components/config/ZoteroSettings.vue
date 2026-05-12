<template>
  <div class="config-section">
    <h3>Zotero 设置</h3>

    <div class="form-row">
      <label>User ID</label>
      <input v-model="configStore.zoteroConfig.user_id" placeholder="数字 ID" />
    </div>

    <div class="form-row">
      <label>API Key</label>
      <div class="input-wrapper">
        <input
          v-model="configStore.zoteroConfig.api_key"
          :type="showApiKey ? 'text' : 'password'"
          placeholder="Zotero API Key"
          class="input-icon-right"
        />
        <button class="toggle-visibility" @click="showApiKey = !showApiKey">
          <Eye v-if="!showApiKey" :size="16" />
          <EyeOff v-else :size="16" />
        </button>
      </div>
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
import { testZoteroConnection } from '../../api'

const configStore = useConfigStore()
const showApiKey = ref(false)
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const testConnection = async () => {
  testing.value = true
  testResult.value = null
  try {
    const result = await testZoteroConnection()
    testResult.value = { success: result.success, message: result.message }
  } catch (err: unknown) {
    let msg = '连接失败'
    if (typeof err === 'string') {
      msg = err
    } else if (err instanceof Error) {
      msg = err.message
    } else {
      msg = String(err)
    }
    testResult.value = { success: false, message: msg }
  } finally {
    testing.value = false
  }
}
</script>
