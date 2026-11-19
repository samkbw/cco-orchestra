// 패널이 보여 주는 단계 (설치 화면 순서: missing → plan → installing → choose → done)
export type Stage = 'loading' | 'missing' | 'plan' | 'installing' | 'choose' | 'done' | 'status' | 'error'

export type CheckRow = {
  label: string
  value: string
  isOk: boolean
}

// 설치 단계 한 줄
export type StepRow = {
  id: string
  title: string
  detail: string
  manual: string | null
  isOptional: boolean
  state: 'todo' | 'running' | 'ok' | 'failed' | 'skipped' | 'manual'
  result: string
}

export type OrchestraView = {
  stage: Stage
  rows: CheckRow[]
  steps: StepRow[]
  notices: string[]
  // 지금 보일 버튼 (register.tsx의 runAction 키)
  actions: string[]
  message: string[]
  isBusy: boolean
}

declare module 'claude-code' {
  interface PluginState {
    orchestra: {
      view: OrchestraView
    }
  }
}
