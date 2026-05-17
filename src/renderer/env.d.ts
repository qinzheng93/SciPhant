/// <reference types="vite/client" />

export {}

import type * as T from '../shared/ipc-api'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
  type ArxivPaper = T.ArxivPaper
  type ConferencePaper = T.ConferencePaper
  type ConferenceInfo = T.ConferenceInfo
  type Topic = T.Topic
  type Category = T.Category
  type LLMConfig = T.LLMConfig
  type OutputConfig = T.OutputConfig
  type ZoteroConfig = T.ZoteroConfig

  interface Window {
    api: T.ElectronAPI
  }
}
