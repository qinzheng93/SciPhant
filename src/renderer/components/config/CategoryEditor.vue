<template>
  <div class="config-section">
    <h3>arXiv 设置</h3>
    <label class="setting-label">抓取分类</label>
    <p class="setting-hint">管理从 arXiv 抓取论文的分类（如 cs.CV, cs.RO）。</p>

    <div class="category-tags">
      <span v-if="configStore.categories.length === 0" class="empty-hint">未设置抓取分类</span>
      <span
        v-for="cat in configStore.categories"
        :key="cat.id"
        class="category-tag"
      >
        {{ cat.name }}
        <span class="tag-remove" @click.stop="deleteCategory(cat.id)"><X :size="12" /></span>
      </span>
    </div>

    <button @click="startAdd" class="btn-default">添加分类</button>

    <!-- Add category dialog -->
    <div v-if="isAdding" class="dialog-overlay" @click.self="isAdding = false">
      <div class="dialog">
        <h4 class="dialog-title">添加分类</h4>
        <div class="form-field">
          <label class="field-label">分类名称（例如：cs.AI，多个分类使用逗号隔开）</label>
          <input v-model="newCategoryName" placeholder="" class="edit-input" @keyup.enter="saveNew" />
        </div>
        <div class="edit-actions">
          <button @click="saveNew" class="btn-save">添加</button>
          <button @click="isAdding = false" class="btn-default">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()
const isAdding = ref(false)
const newCategoryName = ref('')

const startAdd = () => {
  newCategoryName.value = ''
  isAdding.value = true
}

const deleteCategory = async (catId: number) => {
  try {
    await configStore.deleteCategory(catId)
  } catch (err) {
    console.error('Failed to delete category:', err)
    alert('删除失败: ' + (err instanceof Error ? err.message : String(err)))
  }
}

const saveNew = async () => {
  const names = newCategoryName.value.split(',').map(s => s.trim()).filter(Boolean)
  if (names.length === 0) return
  try {
    for (const name of names) {
      await configStore.addCategory(name)
    }
    isAdding.value = false
    newCategoryName.value = ''
  } catch (err) {
    console.error('Failed to add category:', err)
    alert('保存失败: ' + (err instanceof Error ? err.message : String(err)))
  }
}
</script>
