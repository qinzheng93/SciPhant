<template>
  <div class="config-section">
    <h3>主题管理</h3>
    <p class="setting-hint">通过关键词匹配自动为论文关联主题。</p>

    <div class="topics-list">
      <div v-for="topic in configStore.topics" :key="topic.id" class="topic-item">
        <div v-if="editingId === topic.id" class="topic-edit">
          <div class="form-field">
            <label class="field-label">主题名称</label>
            <input v-model="editForm.name" placeholder="输入主题名称" class="edit-input" />
          </div>
          <div class="form-field">
            <label class="field-label">关键词（逗号分隔）</label>
            <input v-model="keywordsInput" placeholder="例如：深度学习, 计算机视觉, Transformer" class="edit-input" />
          </div>
          <div class="edit-actions">
            <button @click="saveEdit(topic.id)" class="btn-save">保存</button>
            <button @click="cancelEdit" class="btn-default">取消</button>
          </div>
        </div>
        <div v-else class="topic-display">
          <div class="topic-info">
            <span class="topic-name">{{ topic.name }}</span>
            <span class="topic-keywords">{{ topic.keywords.join(', ') }}</span>
          </div>
          <div class="topic-actions">
            <button @click="startEdit(topic)" class="btn-default btn-sm">编辑</button>
            <button @click="deleteTopic(topic.id)" class="btn-default btn-sm delete">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-actions">
      <button @click="startAdd" class="btn-default">添加主题</button>
      <button @click="rebuildIndex" class="btn-default">重建索引</button>
    </div>

    <!-- Add topic dialog -->
    <div v-if="isAdding" class="dialog-overlay" @click.self="cancelAdd">
      <div class="dialog">
        <h4 class="dialog-title">添加主题</h4>
        <div class="form-field">
          <label class="field-label">主题名称</label>
          <input v-model="newTopic.name" placeholder="输入主题名称" class="edit-input" />
        </div>
        <div class="form-field">
          <label class="field-label">关键词（逗号分隔）</label>
          <input v-model="newKeywords" placeholder="例如：深度学习, 计算机视觉, Transformer" class="edit-input" />
        </div>
        <div class="edit-actions">
          <button @click="saveNew" class="btn-save">添加</button>
          <button @click="cancelAdd" class="btn-default">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import type { Topic } from '../../types/config'

const configStore = useConfigStore()

const editingId = ref<number | null>(null)
const isAdding = ref(false)
const editForm = ref({ name: '', keywords: [] as string[] })
const keywordsInput = ref('')
const newTopic = ref({ name: '', keywords: [] as string[] })
const newKeywords = ref('')

const startEdit = (topic: Topic) => {
  editingId.value = topic.id
  editForm.value = { name: topic.name, keywords: [...topic.keywords] }
  keywordsInput.value = topic.keywords.join(', ')
}

const saveEdit = async (id: number) => {
  if (!editForm.value.name.trim()) return
  const ok = await configStore.updateTopic(id, {
    name: editForm.value.name,
    keywords: keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean),
  })
  if (ok) editingId.value = null
}

const cancelEdit = () => {
  editingId.value = null
}

const startAdd = () => {
  isAdding.value = true
  newTopic.value = { name: '', keywords: [] }
  newKeywords.value = ''
}

const saveNew = async () => {
  if (!newTopic.value.name.trim()) return
  const ok = await configStore.addTopic({
    name: newTopic.value.name,
    keywords: newKeywords.value.split(',').map(k => k.trim()).filter(Boolean),
    enabled: true,
  })
  if (ok) isAdding.value = false
}

const cancelAdd = () => {
  isAdding.value = false
}

const deleteTopic = async (id: number) => {
  try {
    await configStore.deleteTopic(id)
  } catch (err) {
    console.error('Failed to delete topic:', err)
    alert('删除失败: ' + (err instanceof Error ? err.message : String(err)))
  }
}

const rebuildIndex = () => {
  configStore.triggerRebuild()
}
</script>
